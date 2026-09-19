package tech.eflink.wiki.app.service

import com.unboundid.ldap.listener.InMemoryDirectoryServer
import com.unboundid.ldap.listener.InMemoryDirectoryServerConfig
import com.unboundid.ldif.LDIFReader
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import tech.eflink.wiki.core.auth.AuthCredentials
import tech.eflink.wiki.core.exception.ValidateException

/**
 * LDAP 适配器集成测试：使用 UnboundID 内存目录服务器模拟企业 AD/LDAP，
 * 覆盖 正确凭证 / 错误密码 / 用户不存在 / 属性映射 四条路径。
 */
class LdapAuthProviderTest {

    private lateinit var server: InMemoryDirectoryServer
    private lateinit var provider: LdapAuthProvider
    private val port = 38901

    @BeforeEach
    fun setUp() {
        val config = InMemoryDirectoryServerConfig("dc=example,dc=com")
        config.addAdditionalBindCredentials("cn=Directory Manager", "admin-password")
        config.setListenerConfigs(
            com.unboundid.ldap.listener.InMemoryListenerConfig.createLDAPConfig("test", port)
        )
        server = InMemoryDirectoryServer(config)
        // 目录数据：ou=people 下两个用户（cn/entryUUID/mail）
        val ldif = """
            dn: dc=example,dc=com
            objectClass: top
            objectClass: domain

            dn: ou=people,dc=example,dc=com
            objectClass: top
            objectClass: organizationalUnit
            ou: people

            dn: uid=zhangsan,ou=people,dc=example,dc=com
            objectClass: top
            objectClass: person
            objectClass: organizationalPerson
            objectClass: inetOrgPerson
            uid: zhangsan
            cn: 张三
            sn: zhang
            mail: zhangsan@example.com
            entryUUID: 11111111-2222-3333-4444-555555555555
            userPassword: zhang-pass-123

            dn: uid=lisi,ou=people,dc=example,dc=com
            objectClass: top
            objectClass: person
            objectClass: organizationalPerson
            objectClass: inetOrgPerson
            uid: lisi
            cn: 李四
            sn: li
            mail: lisi@example.com
            entryUUID: 66666666-7777-8888-9999-aaaaaaaaaaaa
            userPassword: lisi-pass-123
        """.trimIndent()
        server.importFromLDIF(true, LDIFReader(java.io.ByteArrayInputStream(ldif.toByteArray())))
        server.startListening()
        provider = LdapAuthProvider(testProps(port))
    }

    @AfterEach
    fun tearDown() {
        server.shutDown(true)
    }

    @Test
    fun `正确凭证返回联合身份`() {
        val identity = provider.authenticate(AuthCredentials("zhangsan", "zhang-pass-123"))
        assertEquals("zhangsan", identity.username)
        assertEquals("张三", identity.displayName)
        assertEquals("zhangsan@example.com", identity.email)
        assertNotNull(identity.externalId)
    }

    @Test
    fun `错误密码抛业务异常`() {
        val ex = runCatching {
            provider.authenticate(AuthCredentials("zhangsan", "wrong-password"))
        }.exceptionOrNull()
        assertTrue(ex is ValidateException)
        assertEquals("账号或密码不正确", ex?.message)
    }

    @Test
    fun `用户不存在抛业务异常`() {
        val ex = runCatching {
            provider.authenticate(AuthCredentials("wangwu", "any-password"))
        }.exceptionOrNull()
        assertTrue(ex is ValidateException)
    }

    @Test
    fun `第二个用户同样可认证`() {
        val identity = provider.authenticate(AuthCredentials("lisi", "lisi-pass-123"))
        assertEquals("李四", identity.displayName)
    }
}

/** 测试用配置（避开 Spring 上下文依赖） */
private fun testProps(port: Int): tech.eflink.wiki.app.config.WikiProperties =
    tech.eflink.wiki.app.config.WikiProperties().apply {
        auth.ldap.host = "127.0.0.1"
        auth.ldap.port = port
        auth.ldap.baseDn = "dc=example,dc=com"
        auth.ldap.bindDnTemplate = "uid={0},ou=people,{baseDn}"
        auth.ldap.displayNameAttr = "cn"
        auth.ldap.emailAttr = "mail"
        auth.ldap.externalIdAttr = "entryUUID"
    }
