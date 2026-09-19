package tech.eflink.wiki.app.service

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import tech.eflink.wiki.store.repository.UserGroupRepository

/**
 * LDAP 部门组同步：登录成功后按身份里的组标识（DN）逐人对齐组成员关系。
 * 组按 external_dn 定位，不存在则以 source=2 落库（组名取首个 RDN 值，重名自动加序号）；
 * 用户在同步组中的成员关系以本次登录目录为准，手动组（source=1）不受影响。
 */
@Service
class LdapGroupSyncService(private val userGroupRepository: UserGroupRepository) {

    private val log = LoggerFactory.getLogger(LdapGroupSyncService::class.java)

    /** 同步单个用户的组关系；groups 为空时仅清除该用户已不在的同步组 */
    fun sync(userId: Long, groups: List<String>) {
        val groupIds = groups.mapNotNull { raw ->
            val dn = raw.trim()
            if (dn.isEmpty()) return@mapNotNull null
            resolveGroup(dn).id
        }
        userGroupRepository.syncMembership(userId, groupIds)
    }

    /** 按 DN 定位组：缺失则创建（source=2，名称取首个 RDN 值，重名自动追加序号） */
    private fun resolveGroup(dn: String): tech.eflink.wiki.database.tables.records.UserGroupRecord =
        userGroupRepository.findByExternalDn(dn) ?: run {
            val base = rdnValue(dn)
            var candidate = base
            var n = 1
            while (userGroupRepository.findByName(candidate) != null) {
                n += 1
                candidate = "$base($n)"
            }
            val id = userGroupRepository.create(candidate, null, 2, dn)
            log.info("LDAP 同步创建用户组 id={} name={} dn={}", id, candidate, dn)
            userGroupRepository.findById(id)!!
        }

    /** 取 DN 的首个 RDN 值：cn=研发部,ou=groups,dc=x → 研发部；解析失败时退回整个 DN */
    private fun rdnValue(dn: String): String =
        dn.substringBefore(',').substringAfter('=', missingDelimiterValue = "").trim()
            .ifEmpty { dn.take(64) }
}
