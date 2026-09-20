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

/** 关联登录发起结果：主站授权中转页地址与防 CSRF state */
@Schema(description = "关联登录发起结果")
class ConnectorStartResult : DataTransferObjectBase() {
    var state: String = ""
    var authorizeUrl: String = ""
}

/** 票据登录 / 冲突授权绑定结果：status=conflict 时凭 bindTicket 走绑定流程 */
@Schema(description = "关联登录结果")
class ConnectorLoginResult : DataTransferObjectBase() {
    /** ok = 登录成功（auth 非空）；conflict = 与既有本地账号撞名，需输密授权 */
    var status: String = "ok"
    var auth: AuthResult? = null
    var bindTicket: String? = null
    var conflictUsername: String? = null
    /** 本次登录完成了新用户建档：前端据此引导创建个人专属空间 */
    var created: Boolean = false
}
