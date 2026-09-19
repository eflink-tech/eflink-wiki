package tech.eflink.wiki.app.service

import com.unboundid.ldap.sdk.LDAPConnection
import com.unboundid.ldap.sdk.LDAPException
import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.core.auth.AuthCredentials
import tech.eflink.wiki.core.auth.AuthProvider
import tech.eflink.wiki.core.auth.FederatedIdentity
import tech.eflink.wiki.core.exception.ValidateException

/**
 * LDAP/AD 企业目录认证适配器（简单绑定 + 属性映射）。
 * 登录 DN 由 bindDnTemplate 生成（{0}=登录名，{baseDn}=baseDn），认证成功后读取 displayName/email/externalId。
 */
@Service
class LdapAuthProvider(private val props: WikiProperties) : AuthProvider {

    override val name: String = "ldap"

    private val ldap get() = props.auth.ldap

    override fun authenticate(credentials: AuthCredentials): FederatedIdentity {
        val username = credentials.username.trim()
        val bindDn = ldap.bindDnTemplate
            .replace("{0}", username)
            .replace("{baseDn}", ldap.baseDn)
        try {
            LDAPConnection(ldap.host, ldap.port).use { connection ->
                // 简单绑定验证凭证（失败会抛 LDAPException，码 49 = 凭证错误）
                connection.bind(bindDn, credentials.password)
                // 绑定成功后读取用户属性（groupAttr 配置非空时一并读取部门/组属性）
                val attrs = buildList {
                    add(ldap.displayNameAttr)
                    add(ldap.emailAttr)
                    add(ldap.externalIdAttr)
                    if (ldap.groupAttr.isNotBlank()) add(ldap.groupAttr)
                }.toTypedArray()
                val search = connection.search(
                    bindDn,
                    com.unboundid.ldap.sdk.SearchScope.BASE,
                    "(objectClass=*)",
                    *attrs
                )
                val entry = search.searchEntries.firstOrNull()
                    ?: throw ValidateException(406, "企业目录中未找到该用户的属性信息")
                val externalId = entry.getAttributeValue(ldap.externalIdAttr) ?: bindDn
                val displayName = entry.getAttributeValue(ldap.displayNameAttr) ?: username
                val email = entry.getAttributeValue(ldap.emailAttr)
                val groups = ldap.groupAttr.takeIf { it.isNotBlank() }
                    ?.let { attr -> entry.getAttributeValues(attr)?.toList() ?: emptyList() }
                    ?: emptyList()
                return FederatedIdentity(
                    externalId = externalId,
                    username = username,
                    displayName = displayName,
                    email = email,
                    groups = groups
                )
            }
        } catch (ex: LDAPException) {
            // 49 = INVALID_CREDENTIALS：凭证错误；其余视为目录服务异常
            if (ex.resultCode == com.unboundid.ldap.sdk.ResultCode.INVALID_CREDENTIALS) {
                throw ValidateException(406, "账号或密码不正确")
            }
            throw ValidateException(406, "企业目录服务不可用：${ex.diagnosticMessage ?: ex.message}")
        }
    }
}
