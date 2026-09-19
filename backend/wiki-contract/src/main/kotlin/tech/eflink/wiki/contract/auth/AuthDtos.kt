package tech.eflink.wiki.contract.auth

import tech.eflink.wiki.core.communication.DataTransferObjectBase
import io.swagger.v3.oas.annotations.media.Schema

/** 用户信息 */
@Schema(description = "用户信息")
class UserResult : DataTransferObjectBase() {
    var id: Long = 0
    var username: String = ""
    var displayName: String = ""
    var avatar: String? = null
    var role: Int = 2          // 1 管理员 2 普通用户
    var status: Int = 1        // 1 正常 2 禁用
    var createdAt: Long? = null
}

/** 登录/初始化成功后的完整凭证 */
@Schema(description = "认证结果：用户信息 + 双 Token")
class AuthResult : DataTransferObjectBase() {
    lateinit var user: UserResult
    var accessToken: String = ""
    var refreshToken: String = ""
}

/** 刷新后的双 Token */
@Schema(description = "刷新后的双 Token")
class RefreshResult : DataTransferObjectBase() {
    var accessToken: String = ""
    var refreshToken: String = ""
}

/** 图形验证码 */
@Schema(description = "图形验证码")
class CaptchaResult : DataTransferObjectBase() {
    lateinit var captchaId: String
    lateinit var image: String   // data:image/png;base64,...
}

/** 初始化状态 */
@Schema(description = "工作区初始化状态")
class SetupStatusResult : DataTransferObjectBase() {
    var initialized: Boolean = false
}
