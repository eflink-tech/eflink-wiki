package tech.eflink.wiki.app.service

import org.jooq.DSLContext
import org.jooq.Field
import org.springframework.stereotype.Service
import tech.eflink.wiki.core.auth.FederatedIdentity
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.tables.records.UserRecord
import tech.eflink.wiki.store.repository.UserRepository

/** 企业联合身份落库：首次登录自动建档或按用户名关联既有本地账号 */
@Service
class FederationService(
    private val dsl: DSLContext,
    private val userRepository: UserRepository
) {

    fun federate(provider: String, identity: FederatedIdentity): UserRecord {
        // 1) 已有（provider, externalId）档案 → 直接返回
        userRepository.findByProviderAndExternalId(provider, identity.externalId)?.let { return it }

        // 2) 同名本地账号存在 → 关联外部身份
        val existing = userRepository.findByUsername(identity.username)
        if (existing != null) {
            val assignments = LinkedHashMap<Field<*>, Any>()
            assignments[USER.PROVIDER] = provider
            assignments[USER.EXTERNAL_ID] = identity.externalId
            identity.email?.let { assignments[USER.EMAIL] = it }
            dsl.update(USER).set(assignments).where(USER.ID.eq(existing.id)).execute()
            return userRepository.findById(existing.id)!!
        }

        // 3) 新建档案（无本地密码，密码散列置为不可用占位）
        val id = userRepository.create(
            username = identity.username,
            passwordHash = "!ldap-no-local-password",
            displayName = identity.displayName.ifBlank { identity.username },
            role = 2
        )
        val assignments = LinkedHashMap<Field<*>, Any>()
        assignments[USER.PROVIDER] = provider
        assignments[USER.EXTERNAL_ID] = identity.externalId
        identity.email?.let { assignments[USER.EMAIL] = it }
        dsl.update(USER).set(assignments).where(USER.ID.eq(id)).execute()
        return userRepository.findById(id)!!
    }
}
