package tech.eflink.wiki.app.impl.auth.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.CaptchaService
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.app.service.PasswordService
import tech.eflink.wiki.app.service.RefreshTokenService
import tech.eflink.wiki.contract.auth.AuthResult
import tech.eflink.wiki.contract.auth.CaptchaResult
import tech.eflink.wiki.contract.auth.ChangePasswordCommand
import tech.eflink.wiki.contract.auth.GetCaptchaCommand
import tech.eflink.wiki.contract.auth.LoginCommand
import tech.eflink.wiki.contract.auth.LogoutCommand
import tech.eflink.wiki.contract.auth.RefreshResult
import tech.eflink.wiki.contract.auth.RefreshTokenCommand
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.UserRepository

/** 图形验证码 */
@Service
class GetCaptchaCommandHandler(private val captchaService: CaptchaService) :
    CommandHandlerBase<GetCaptchaCommand, CaptchaResult>() {

    override fun handle(command: GetCaptchaCommand, result: CaptchaResult) {
        val (id, image) = captchaService.create()
        result.captchaId = id
        result.image = image
    }
}

/** 账号密码登录 */
@Service
class LoginCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val jwtService: JwtService,
    private val refreshTokenService: RefreshTokenService,
    private val captchaService: CaptchaService,
    private val props: WikiProperties,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService,
    private val ldapAuthProvider: tech.eflink.wiki.app.service.LdapAuthProvider,
    private val federationService: tech.eflink.wiki.app.service.FederationService,
    private val ldapGroupSyncService: tech.eflink.wiki.app.service.LdapGroupSyncService
) : CommandHandlerBase<LoginCommand, AuthResult>() {

    override fun validate(command: LoginCommand) {
        val request = command.request
        require(request.username.isNotBlank()) { "请输入账号" }
        require(request.password.isNotBlank()) { "请输入密码" }
        if (props.captchaEnabled) {
            captchaService.verify(request.captchaId, request.captchaCode)
        }
    }

    override fun handle(command: LoginCommand, result: AuthResult) {
        // 企业目录模式：LDAP 验证 → 联合建档 → 组同步 → 签发会话
        if (props.auth.mode == "ldap") {
            val identity = ldapAuthProvider.authenticate(
                tech.eflink.wiki.core.auth.AuthCredentials(command.request.username, command.request.password)
            )
            val user = federationService.federate("ldap", identity)
            if (user.status != 1) throw ValidateException(406, "账号已被禁用，请联系管理员")
            if (props.auth.ldap.groupAttr.isNotBlank()) {
                ldapGroupSyncService.sync(user.id, identity.groups)
            }
            operationLogService.logFor(user.id, user.username, "user.login", "user", user.id, "LDAP 登录成功")
            result.user = DtoMappers.toUserResult(user)
            result.accessToken = jwtService.generateAccessToken(user.id, user.username, user.role)
            result.refreshToken = refreshTokenService.issue(user.id)
            return
        }

        // 本地账号模式
        val user = userRepository.findByUsername(command.request.username.trim())
            ?: throw ValidateException(406, "账号或密码不正确")
        if (user.status != 1) throw ValidateException(406, "账号已被禁用，请联系管理员")
        if (!passwordService.matches(command.request.password, user.passwordHash)) {
            throw ValidateException(406, "账号或密码不正确")
        }
        operationLogService.logFor(user.id, user.username, "user.login", "user", user.id, "登录成功")
        result.user = DtoMappers.toUserResult(user)
        result.accessToken = jwtService.generateAccessToken(user.id, user.username, user.role)
        result.refreshToken = refreshTokenService.issue(user.id)
    }
}

/** 刷新令牌（轮换：旧令牌立即作废） */
@Service
class RefreshTokenCommandHandler(
    private val userRepository: UserRepository,
    private val jwtService: JwtService,
    private val refreshTokenService: RefreshTokenService
) : CommandHandlerBase<RefreshTokenCommand, RefreshResult>() {

    override fun handle(command: RefreshTokenCommand, result: RefreshResult) {
        val record = refreshTokenService.consume(command.request.refreshToken)
        val user = userRepository.findById(record.userId)
            ?: throw TokenValidationException(406, "账号不存在")
        if (user.status != 1) throw TokenValidationException(406, "账号已被禁用")
        refreshTokenService.revoke(command.request.refreshToken)
        result.accessToken = jwtService.generateAccessToken(user.id, user.username, user.role)
        result.refreshToken = refreshTokenService.issue(user.id)
    }
}

/** 登出：吊销刷新令牌 */
@Service
class LogoutCommandHandler(private val refreshTokenService: RefreshTokenService) :
    CommandHandlerBase<LogoutCommand, EmptyResult>() {

    override fun handle(command: LogoutCommand, result: EmptyResult) {
        if (command.request.refreshToken.isNotBlank()) {
            refreshTokenService.revoke(command.request.refreshToken)
        }
    }
}

/** 修改本人密码：成功后吊销全部刷新令牌（所有设备需重新登录） */
@Service
class ChangePasswordCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val refreshTokenService: RefreshTokenService
) : CommandHandlerBase<ChangePasswordCommand, EmptyResult>() {

    override fun validate(command: ChangePasswordCommand) {
        require(command.request.oldPassword.isNotBlank()) { "请输入原密码" }
        require(command.request.newPassword.length >= 6) { "新密码至少 6 位" }
    }

    override fun handle(command: ChangePasswordCommand, result: EmptyResult) {
        val userId = AuthContext.currentUserId()
        val user = userRepository.findById(userId) ?: throw TokenValidationException(406, "账号不存在")
        if (!passwordService.matches(command.request.oldPassword, user.passwordHash)) {
            throw ValidateException(406, "原密码不正确")
        }
        userRepository.update(userId, passwordHash = passwordService.encode(command.request.newPassword))
        refreshTokenService.revokeAllForUser(userId)
    }
}

/** 我的信息（供 user 域复用的组装工具也放在此处） */
@Service
class GetMeCommandHandler(private val userRepository: UserRepository) :
    CommandHandlerBase<tech.eflink.wiki.contract.user.GetMeCommand, UserResult>() {

    override fun handle(command: tech.eflink.wiki.contract.user.GetMeCommand, result: UserResult) {
        val user = userRepository.findById(AuthContext.currentUserId())
            ?: throw TokenValidationException(406, "账号不存在")
        result.apply {
            id = user.id
            username = user.username
            displayName = user.displayName
            avatar = user.avatar
            role = user.role
            status = user.status
            createdAt = DtoMappers.epoch(user.createdAt)
        }
    }
}

/** 更新个人信息（姓名/头像） */
@Service
class UpdateMeCommandHandler(private val userRepository: UserRepository) :
    CommandHandlerBase<tech.eflink.wiki.contract.user.UpdateMeCommand, UserResult>() {

    override fun handle(command: tech.eflink.wiki.contract.user.UpdateMeCommand, result: UserResult) {
        val userId = AuthContext.currentUserId()
        userRepository.findById(userId) ?: throw TokenValidationException(406, "账号不存在")
        val displayName = command.request.displayName?.trim()?.takeIf { it.isNotEmpty() }
        // avatar 为 null 表示不改；空串表示清除头像
        val avatar = command.request.avatar?.trim()
        if (displayName == null && avatar == null) throw ValidateException(406, "没有需要更新的内容")
        userRepository.update(userId, displayName = displayName, avatar = avatar)
        val user = userRepository.findById(userId)!!
        result.apply {
            id = user.id
            username = user.username
            this.displayName = user.displayName
            this.avatar = user.avatar
            role = user.role
            status = user.status
            createdAt = DtoMappers.epoch(user.createdAt)
        }
    }
}
