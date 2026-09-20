package tech.eflink.wiki.app.service

import org.jooq.DSLContext
import org.jooq.Field
import org.springframework.stereotype.Service
import tech.eflink.wiki.core.auth.FederatedIdentity
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.tables.records.UserRecord
import tech.eflink.wiki.store.repository.UserRepository

/** 联合身份解析结果 */
sealed interface FederationOutcome {
    val user: UserRecord

    /** 已定位或已建档，可直接签发会话 */
    data class Resolved(override val user: UserRecord, val created: Boolean) : FederationOutcome

    /** 与既有本地账号撞名且尚未关联：需要账号归属者显式授权绑定 */
    data class UsernameConflict(override val user: UserRecord) : FederationOutcome
}

/** 企业联合身份落库：首次登录自动建档或按用户名关联既有本地账号 */
@Service
class FederationService(
    private val dsl: DSLContext,
    private val userRepository: UserRepository
) {

    /**
     * LDAP 等信任目录的联合登录：同名本地账号自动关联（历史行为）。
     * 主站关联登录等不信任撞名自动接管，请改用 [resolve]。
     */
    fun federate(provider: String, identity: FederatedIdentity): UserRecord {
        userRepository.findByProviderAndExternalId(provider, identity.externalId)?.let { return it }
        val existing = userRepository.findByUsername(identity.username)
        if (existing != null) {
            linkExternal(existing.id, provider, identity.externalId, identity.email)
            return userRepository.findById(existing.id)!!
        }
        return createFederatedUser(provider, identity)
    }

    /** 不做自动关联的解析：已关联 → 命中；撞名 → 冲突；其余 → 建档 */
    fun resolve(provider: String, identity: FederatedIdentity): FederationOutcome {
        userRepository.findByProviderAndExternalId(provider, identity.externalId)?.let {
            return FederationOutcome.Resolved(it, created = false)
        }
        userRepository.findByUsername(identity.username)?.let {
            return FederationOutcome.UsernameConflict(it)
        }
        return FederationOutcome.Resolved(createFederatedUser(provider, identity), created = true)
    }

    /** 把外部身份写接到指定本地账号（授权绑定通过后调用） */
    fun linkExternal(userId: Long, provider: String, externalId: String, email: String?) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        assignments[USER.PROVIDER] = provider
        assignments[USER.EXTERNAL_ID] = externalId
        email?.let { assignments[USER.EMAIL] = it }
        dsl.update(USER).set(assignments).where(USER.ID.eq(userId)).execute()
    }

    /** 是否仍是可被授权绑定的纯本地账号 */
    fun isBindableLocalAccount(user: UserRecord): Boolean =
        (user.provider.isBlank() || user.provider == "local") && user.externalId == null

    private fun createFederatedUser(provider: String, identity: FederatedIdentity): UserRecord {
        val id = userRepository.create(
            username = identity.username,
            passwordHash = NO_LOCAL_PASSWORD,
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

    companion object {
        /** 联合账号不设本地密码：! 开头永远无法通过 BCrypt 校验 */
        const val NO_LOCAL_PASSWORD = "!federated-no-local-password"
    }
}
