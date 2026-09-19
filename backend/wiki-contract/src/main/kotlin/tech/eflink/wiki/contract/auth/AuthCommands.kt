package tech.eflink.wiki.contract.auth

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.EmptyResult

/** 登录请求 */
data class LoginRequest(
    val username: String = "",
    val password: String = "",
    val captchaId: String? = null,
    val captchaCode: String? = null
)

class LoginCommand(val request: LoginRequest) : CommandObjectBase<AuthResult>()

/** 刷新令牌请求 */
data class RefreshTokenRequest(val refreshToken: String = "")

class RefreshTokenCommand(val request: RefreshTokenRequest) : CommandObjectBase<RefreshResult>()

/** 登出请求 */
data class LogoutRequest(val refreshToken: String = "")

class LogoutCommand(val request: LogoutRequest) : CommandObjectBase<EmptyResult>()

/** 修改本人密码请求 */
data class ChangePasswordRequest(val oldPassword: String = "", val newPassword: String = "")

class ChangePasswordCommand(val request: ChangePasswordRequest) : CommandObjectBase<EmptyResult>()

/** 首次初始化请求（创建第一个管理员） */
data class SetupRequest(
    val username: String = "",
    val password: String = "",
    val displayName: String = ""
)

class InitializeWorkspaceCommand(val request: SetupRequest) : CommandObjectBase<AuthResult>()

class GetCaptchaCommand : CommandObjectBase<CaptchaResult>()

class GetSetupStatusCommand : CommandObjectBase<SetupStatusResult>()
