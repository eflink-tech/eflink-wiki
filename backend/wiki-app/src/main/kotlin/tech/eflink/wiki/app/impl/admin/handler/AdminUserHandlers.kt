package tech.eflink.wiki.app.impl.admin.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.PasswordService
import tech.eflink.wiki.app.service.RefreshTokenService
import tech.eflink.wiki.contract.admin.CreateUserCommand
import tech.eflink.wiki.contract.admin.CreateUserRequest
import tech.eflink.wiki.contract.admin.ListUsersCommand
import tech.eflink.wiki.contract.admin.UpdateUserCommand
import tech.eflink.wiki.contract.admin.UserPageResult
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.UserRepository

/** 管理后台公共校验 */
fun requireSystemAdmin() {
    if (!AuthContext.isSystemAdmin()) throw TokenValidationException(406, "需要管理员权限")
}

/** 用户分页列表 */
@Service
class ListUsersCommandHandler(private val userRepository: UserRepository) :
    CommandHandlerBase<ListUsersCommand, UserPageResult>() {

    override fun validate(command: ListUsersCommand) = requireSystemAdmin()

    override fun handle(command: ListUsersCommand, result: UserPageResult) {
        val page = command.request.page.coerceAtLeast(1)
        val size = command.request.size.coerceIn(1, 100)
        result.page = page
        result.size = size
        result.total = userRepository.countByKeyword(command.request.keyword)
        result.list = userRepository.page(command.request.keyword, (page - 1) * size, size)
            .map { DtoMappers.toUserResult(it) }
            .toMutableList()
    }
}

/** 创建账号（无自助注册，账号一律由管理员创建） */
@Service
class CreateUserCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val licenseService: tech.eflink.wiki.app.service.LicenseService,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService
) : CommandHandlerBase<CreateUserCommand, UserResult>() {

    override fun validate(command: CreateUserCommand) {
        requireSystemAdmin()
        validateRequest(command.request)
    }

    private fun validateRequest(request: CreateUserRequest) {
        require(request.username.isNotBlank()) { "账号不能为空" }
        require(request.username.length in 3..64) { "账号长度需在 3-64 位之间" }
        require(!request.username.contains(' ')) { "账号不能包含空格" }
        require(request.password.length >= 6) { "初始密码至少 6 位" }
        require(request.displayName.isNotBlank()) { "姓名不能为空" }
        require(request.role == 1 || request.role == 2) { "角色不合法" }
    }

    override fun handle(command: CreateUserCommand, result: UserResult) {
        validateRequest(command.request)
        licenseService.assertCanCreateUser()
        val request = command.request
        if (userRepository.findByUsername(request.username.trim()) != null) {
            throw ValidateException(406, "账号已存在")
        }
        val id = userRepository.create(
            username = request.username.trim(),
            passwordHash = passwordService.encode(request.password),
            displayName = request.displayName.trim(),
            role = request.role
        )
        operationLogService.log("user.create", "user", id, "创建账号 ${request.username}")
        DtoMappers.toUserResult(userRepository.findById(id)!!).let {
            result.id = it.id; result.username = it.username; result.displayName = it.displayName
            result.avatar = it.avatar; result.role = it.role; result.status = it.status; result.createdAt = it.createdAt
        }
    }
}
/** 更新用户：姓名/角色/状态/重置密码；不允许禁用自己、不允许降级/禁用最后一个管理员 */
@Service
class UpdateUserCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val refreshTokenService: RefreshTokenService
) : CommandHandlerBase<UpdateUserCommand, UserResult>() {

    override fun validate(command: UpdateUserCommand) = requireSystemAdmin()

    override fun handle(command: UpdateUserCommand, result: UserResult) {
        val target = userRepository.findById(command.id) ?: throw ValidateException(406, "用户不存在")
        val request = command.request
        val currentUserId = AuthContext.currentUserId()

        val demoteToUser = request.role != null && target.role == 1 && request.role == 2
        val disable = request.status != null && request.status == 2
        if ((demoteToUser || disable) && target.role == 1 && userRepository.countAdmins() <= 1) {
            throw ValidateException(406, "至少保留一个管理员")
        }
        if (disable && target.id == currentUserId) {
            throw ValidateException(406, "不能禁用自己")
        }

        val passwordHash = request.password?.takeIf { it.isNotBlank() }?.let {
            require(it.length >= 6) { "重置密码至少 6 位" }
            passwordService.encode(it)
        }
        userRepository.update(
            id = target.id,
            displayName = request.displayName?.trim()?.takeIf { it.isNotEmpty() },
            passwordHash = passwordHash,
            role = request.role,
            status = request.status
        )
        // 重置密码/禁用后强制该用户全部设备重新登录
        if (passwordHash != null || (disable && target.status != 2)) {
            refreshTokenService.revokeAllForUser(target.id)
        }
        DtoMappers.toUserResult(userRepository.findById(target.id)!!).let {
            result.id = it.id; result.username = it.username; result.displayName = it.displayName
            result.avatar = it.avatar; result.role = it.role; result.status = it.status; result.createdAt = it.createdAt
        }
    }
}
