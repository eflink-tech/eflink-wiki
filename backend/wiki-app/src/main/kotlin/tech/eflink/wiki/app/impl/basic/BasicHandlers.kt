package tech.eflink.wiki.app.impl.basic.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.contract.auth.GetSetupStatusCommand
import tech.eflink.wiki.contract.auth.InitializeWorkspaceCommand
import tech.eflink.wiki.contract.auth.AuthResult
import tech.eflink.wiki.contract.auth.SetupRequest
import tech.eflink.wiki.contract.auth.SetupStatusResult
import tech.eflink.wiki.contract.basic.GetPublicConfigCommand
import tech.eflink.wiki.contract.basic.PublicConfigResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.app.service.PasswordService
import tech.eflink.wiki.app.service.RefreshTokenService
import tech.eflink.wiki.store.repository.UserRepository

/** 公开配置 */
@Service
class GetPublicConfigCommandHandler(private val props: WikiProperties) :
    CommandHandlerBase<GetPublicConfigCommand, PublicConfigResult>() {

    override fun handle(command: GetPublicConfigCommand, result: PublicConfigResult) {
        result.productName = props.branding.productName
        result.logoUrl = props.branding.logoUrl
        result.version = "0.1.0"
        result.captchaEnabled = props.captchaEnabled
        result.embedBackShow = props.embed.backShow
        result.embedBackHref = props.embed.backHref
    }
}

/** 初始化状态：是否已存在用户 */
@Service
class GetSetupStatusCommandHandler(private val userRepository: UserRepository) :
    CommandHandlerBase<GetSetupStatusCommand, SetupStatusResult>() {

    override fun handle(command: GetSetupStatusCommand, result: SetupStatusResult) {
        result.initialized = userRepository.countAll() > 0
    }
}

/** 首次初始化：创建第一个管理员并直接登录（仅当系统内没有任何用户时可用） */
@Service
class InitializeWorkspaceCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val jwtService: JwtService,
    private val refreshTokenService: RefreshTokenService
) : CommandHandlerBase<InitializeWorkspaceCommand, AuthResult>() {

    override fun validate(command: InitializeWorkspaceCommand) {
        val request = command.request
        require(request.username.isNotBlank()) { "管理员账号不能为空" }
        require(request.username.length in 3..64) { "管理员账号长度需在 3-64 位之间" }
        require(request.password.length >= 6) { "密码至少 6 位" }
        require(request.displayName.isNotBlank()) { "姓名不能为空" }
    }

    override fun handle(command: InitializeWorkspaceCommand, result: AuthResult) {
        if (userRepository.countAll() > 0) throw ValidateException(406, "系统已完成初始化")
        val request = command.request
        if (userRepository.findByUsername(request.username.trim()) != null) {
            throw ValidateException(406, "账号已存在")
        }
        val id = userRepository.create(
            username = request.username.trim(),
            passwordHash = passwordService.encode(request.password),
            displayName = request.displayName.trim(),
            role = 1
        )
        fillAuthResult(result, userRepository.findById(id)!!)
    }

    fun fillAuthResult(result: AuthResult, user: tech.eflink.wiki.database.tables.records.UserRecord) {
        result.user = DtoMappers.toUserResult(user)
        result.accessToken = jwtService.generateAccessToken(user.id, user.username, user.role)
        result.refreshToken = refreshTokenService.issue(user.id)
    }
}
