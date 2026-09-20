package tech.eflink.wiki.app.impl.auth.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.ConnectorPendingStore
import tech.eflink.wiki.app.service.EflinkConnectorClient
import tech.eflink.wiki.app.service.FederationOutcome
import tech.eflink.wiki.app.service.FederationService
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.app.service.OperationLogService
import tech.eflink.wiki.app.service.PasswordService
import tech.eflink.wiki.app.service.RefreshTokenService
import tech.eflink.wiki.contract.auth.ConnectorBindCommand
import tech.eflink.wiki.contract.auth.ConnectorBindRequest
import tech.eflink.wiki.contract.auth.ConnectorLoginCommand
import tech.eflink.wiki.contract.auth.ConnectorLoginRequest
import tech.eflink.wiki.contract.auth.ConnectorLoginResult
import tech.eflink.wiki.contract.auth.ConnectorStartCommand
import tech.eflink.wiki.contract.auth.ConnectorStartResult
import tech.eflink.wiki.core.auth.FederatedIdentity
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.database.tables.records.UserRecord
import tech.eflink.wiki.store.repository.UserRepository
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

/** eflink 主站关联登录的账号来源标识（user.provider） */
const val EFLINK_PROVIDER = "eflink"

private fun requireEnabled(props: WikiProperties): WikiProperties.Eflink {
    val conf = props.auth.eflink
    if (!conf.enabled || conf.baseUrl.isBlank() || conf.secret.isBlank() || conf.redirectBase.isBlank()) {
        throw ValidateException(406, "eflink 关联登录未启用")
    }
    return conf
}

/** 签发会话：状态校验 + 操作日志 + 双 Token，三个入口共用 */
private fun issueSession(
    user: UserRecord,
    detail: String,
    result: ConnectorLoginResult,
    jwtService: JwtService,
    refreshTokenService: RefreshTokenService,
    operationLogService: OperationLogService
) {
    if (user.status != 1) throw ValidateException(406, "账号已被禁用，请联系管理员")
    operationLogService.logFor(user.id, user.username, "user.login", "user", user.id, detail)
    result.auth = tech.eflink.wiki.contract.auth.AuthResult().apply {
        this.user = DtoMappers.toUserResult(user)
        accessToken = jwtService.generateAccessToken(user.id, user.username, user.role)
        refreshToken = refreshTokenService.issue(user.id)
    }
}

/** 发起关联登录：生成防 CSRF state 与主站中转页地址 */
@Service
class ConnectorStartCommandHandler(private val props: WikiProperties) :
    CommandHandlerBase<ConnectorStartCommand, ConnectorStartResult>() {

    override fun handle(command: ConnectorStartCommand, result: ConnectorStartResult) {
        val conf = requireEnabled(props)
        val state = UUID.randomUUID().toString().replace("-", "")
        val redirect = URLEncoder.encode(conf.redirectBase.trimEnd('/'), StandardCharsets.UTF_8)
        result.state = state
        result.authorizeUrl = "${conf.baseUrl.trimEnd('/')}/connect/wiki?state=$state&redirect=$redirect"
    }
}

/** 票据登录：兑换主站一次性票据 → 已关联直登 / 撞名转授权绑定 / 建档（created 标记供前端引导建空间） */
@Service
class ConnectorLoginCommandHandler(
    private val props: WikiProperties,
    private val client: EflinkConnectorClient,
    private val federationService: FederationService,
    private val userRepository: UserRepository,
    private val pendingStore: ConnectorPendingStore,
    private val jwtService: JwtService,
    private val refreshTokenService: RefreshTokenService,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<ConnectorLoginCommand, ConnectorLoginResult>() {

    override fun validate(command: ConnectorLoginCommand) {
        val request = command.request
        require(request.ticket.isNotBlank()) { "缺少登录票据" }
        require(request.state.isNotBlank()) { "缺少 state 参数" }
    }

    override fun handle(command: ConnectorLoginCommand, result: ConnectorLoginResult) {
        requireEnabled(props)
        val request = command.request
        val identity = client.exchange(request.ticket.trim())
        // 主站票据绑定的 state 必须与本次请求一致，防止票据错位
        if (identity.state != request.state.trim()) {
            throw ValidateException(406, "授权校验失败，请重新发起登录")
        }
        val federated = FederatedIdentity(
            externalId = identity.externalId,
            username = identity.username,
            displayName = identity.username,
            email = identity.email
        )
        when (val outcome = federationService.resolve(EFLINK_PROVIDER, federated)) {
            is FederationOutcome.UsernameConflict -> {
                if (!federationService.isBindableLocalAccount(outcome.user)) {
                    throw ValidateException(406, "同名账号已关联其他身份，请联系管理员")
                }
                result.status = "conflict"
                result.conflictUsername = outcome.user.username
                result.bindTicket = pendingStore.put(identity.externalId, identity.username, identity.email)
            }

            is FederationOutcome.Resolved -> {
                result.created = outcome.created
                issueSession(
                    outcome.user, "eflink 关联登录", result,
                    jwtService, refreshTokenService, operationLogService
                )
            }
        }
    }
}

/** 冲突授权绑定：验证冲突本地账号密码证明归属后写接外部身份并登录 */
@Service
class ConnectorBindCommandHandler(
    private val props: WikiProperties,
    private val userRepository: UserRepository,
    private val federationService: FederationService,
    private val passwordService: PasswordService,
    private val pendingStore: ConnectorPendingStore,
    private val jwtService: JwtService,
    private val refreshTokenService: RefreshTokenService,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<ConnectorBindCommand, ConnectorLoginResult>() {

    override fun validate(command: ConnectorBindCommand) {
        val request = command.request
        require(request.bindTicket.isNotBlank()) { "缺少授权凭证" }
        require(request.password.isNotBlank()) { "请输入账号密码" }
    }

    override fun handle(command: ConnectorBindCommand, result: ConnectorLoginResult) {
        requireEnabled(props)
        val token = command.request.bindTicket.trim()
        val pending = pendingStore.peek(token)
            ?: throw ValidateException(406, "授权会话已过期，请重新发起关联登录")
        val localUser = userRepository.findByUsername(pending.username)
            ?: throw ValidateException(406, "同名账号已不存在，请重新发起关联登录")
        if (!federationService.isBindableLocalAccount(localUser)) {
            pendingStore.remove(token)
            throw ValidateException(406, "该账号已关联其他身份，请联系管理员")
        }
        if (!passwordService.matches(command.request.password, localUser.passwordHash)) {
            val retryable = pendingStore.recordFailure(token)
            throw ValidateException(
                406,
                if (retryable) "账号或密码不正确" else "授权尝试次数过多，请重新发起关联登录"
            )
        }
        pendingStore.remove(token)
        federationService.linkExternal(localUser.id, EFLINK_PROVIDER, pending.externalId, pending.email)
        val user = userRepository.findById(localUser.id)!!
        issueSession(
            user, "eflink 关联登录（授权绑定）", result,
            jwtService, refreshTokenService, operationLogService
        )
    }
}
