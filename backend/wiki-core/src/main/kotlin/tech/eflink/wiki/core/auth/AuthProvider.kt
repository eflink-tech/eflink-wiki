package tech.eflink.wiki.core.auth

/** 企业身份凭证 */
class AuthCredentials(val username: String, val password: String)

/** 企业目录联合身份（认证成功后落到本地用户档案） */
class FederatedIdentity(
    val externalId: String,
    val username: String,
    val displayName: String,
    val email: String?,
    /** 所属部门/组标识（如 memberOf 的 DN 列表），供组同步用 */
    val groups: List<String> = emptyList()
)

/**
 * 认证提供方 SPI：本地账号是默认实现；企业目录（LDAP）/OIDC 等以适配器扩展。
 * 实现类失败时抛 RuntimeException，由登录流程转成统一错误。
 */
interface AuthProvider {
    /** 提供方名称（与 user.provider 对应：ldap / oidc / ...） */
    val name: String

    /** 校验凭证并返回联合身份 */
    fun authenticate(credentials: AuthCredentials): FederatedIdentity
}
