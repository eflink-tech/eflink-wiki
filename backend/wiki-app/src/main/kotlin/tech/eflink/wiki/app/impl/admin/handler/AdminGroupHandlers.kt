package tech.eflink.wiki.app.impl.admin.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.OperationLogService
import tech.eflink.wiki.contract.admin.AddGroupMemberCommand
import tech.eflink.wiki.contract.admin.CreateUserGroupCommand
import tech.eflink.wiki.contract.admin.DeleteUserGroupCommand
import tech.eflink.wiki.contract.admin.GroupMemberAddRequest
import tech.eflink.wiki.contract.admin.GroupMemberListResult
import tech.eflink.wiki.contract.admin.GroupMemberResult
import tech.eflink.wiki.contract.admin.ListGroupMembersCommand
import tech.eflink.wiki.contract.admin.ListUserGroupsCommand
import tech.eflink.wiki.contract.admin.RemoveGroupMemberCommand
import tech.eflink.wiki.contract.admin.UpdateUserGroupCommand
import tech.eflink.wiki.contract.admin.UserGroupPageResult
import tech.eflink.wiki.contract.admin.UserGroupResult
import tech.eflink.wiki.contract.admin.UserGroupUpsertRequest
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.UserGroupRepository
import tech.eflink.wiki.store.repository.UserRepository

/** 组分页列表 */
@Service
class ListUserGroupsCommandHandler(private val userGroupRepository: UserGroupRepository) :
    CommandHandlerBase<ListUserGroupsCommand, UserGroupPageResult>() {

    override fun validate(command: ListUserGroupsCommand) = requireSystemAdmin()

    override fun handle(command: ListUserGroupsCommand, result: UserGroupPageResult) {
        val page = command.request.page.coerceAtLeast(1)
        val size = command.request.size.coerceIn(1, 100)
        result.page = page
        result.size = size
        result.total = userGroupRepository.countByKeyword(command.request.keyword)
        result.list = userGroupRepository.page(command.request.keyword, (page - 1) * size, size)
            .map { row ->
                UserGroupResult().apply {
                    id = row.group.id
                    name = row.group.name
                    description = row.group.description
                    source = row.group.source
                    externalDn = row.group.externalDn
                    memberCount = row.memberCount
                    spaceCount = row.spaceCount
                    createdAt = DtoMappers.epoch(row.group.createdAt)
                }
            }
            .toMutableList()
    }
}

/** 创建组（手动，source=1） */
@Service
class CreateUserGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<CreateUserGroupCommand, UserGroupResult>() {

    override fun validate(command: CreateUserGroupCommand) {
        requireSystemAdmin()
        validateRequest(command.request)
    }

    override fun handle(command: CreateUserGroupCommand, result: UserGroupResult) {
        val name = command.request.name.trim()
        if (userGroupRepository.findByName(name) != null) throw ValidateException(406, "组名已存在")
        val id = userGroupRepository.create(name, command.request.description?.trim()?.takeIf { it.isNotEmpty() }, 1)
        operationLogService.log("group.create", "user_group", id, "创建用户组 $name")
        fill(userGroupRepository.findById(id)!!, result)
    }

    private fun validateRequest(request: UserGroupUpsertRequest) {
        require(request.name.isNotBlank()) { "组名不能为空" }
        require(request.name.trim().length <= 64) { "组名过长" }
    }
}

/** 更新组（改名/改描述） */
@Service
class UpdateUserGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<UpdateUserGroupCommand, UserGroupResult>() {

    override fun validate(command: UpdateUserGroupCommand) {
        requireSystemAdmin()
        require(command.request.name.isNotBlank()) { "组名不能为空" }
    }

    override fun handle(command: UpdateUserGroupCommand, result: UserGroupResult) {
        val group = userGroupRepository.findById(command.id) ?: throw ValidateException(406, "用户组不存在")
        val name = command.request.name.trim()
        userGroupRepository.findByName(name)?.let { if (it.id != group.id) throw ValidateException(406, "组名已存在") }
        userGroupRepository.update(group.id, name = name, description = command.request.description?.trim()?.takeIf { it.isNotEmpty() })
        operationLogService.log("group.update", "user_group", group.id, "更新用户组 $name")
        fill(userGroupRepository.findById(group.id)!!, result)
    }
}

/** 删除组（软删，并清理组成员关系与空间授权） */
@Service
class DeleteUserGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<DeleteUserGroupCommand, tech.eflink.wiki.core.communication.EmptyResult>() {

    override fun validate(command: DeleteUserGroupCommand) = requireSystemAdmin()

    override fun handle(command: DeleteUserGroupCommand, result: tech.eflink.wiki.core.communication.EmptyResult) {
        val group = userGroupRepository.findById(command.id) ?: throw ValidateException(406, "用户组不存在")
        userGroupRepository.softDelete(group.id)
        operationLogService.log("group.delete", "user_group", group.id, "删除用户组 ${group.name}（含成员关系与空间授权）")
    }
}

/** 组成员列表 */
@Service
class ListGroupMembersCommandHandler(private val userGroupRepository: UserGroupRepository) :
    CommandHandlerBase<ListGroupMembersCommand, GroupMemberListResult>() {

    override fun validate(command: ListGroupMembersCommand) = requireSystemAdmin()

    override fun handle(command: ListGroupMembersCommand, result: GroupMemberListResult) {
        userGroupRepository.findById(command.id) ?: throw ValidateException(406, "用户组不存在")
        result.list = userGroupRepository.listMembers(command.id)
            .map { row ->
                GroupMemberResult().apply {
                    id = row["id"] as Long
                    userId = row["userId"] as Long
                    username = row["username"] as String
                    displayName = row["displayName"] as String
                    avatar = row["avatar"] as String?
                    createdAt = DtoMappers.epoch(row["createdAt"] as? java.time.LocalDateTime)
                }
            }
            .toMutableList()
    }
}

/** 添加组成员 */
@Service
class AddGroupMemberCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val userRepository: UserRepository,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<AddGroupMemberCommand, GroupMemberResult>() {

    override fun validate(command: AddGroupMemberCommand) = requireSystemAdmin()

    override fun handle(command: AddGroupMemberCommand, result: GroupMemberResult) {
        val group = userGroupRepository.findById(command.id) ?: throw ValidateException(406, "用户组不存在")
        val user = userRepository.findById(command.request.userId) ?: throw ValidateException(406, "用户不存在")
        if (userGroupRepository.findMember(group.id, user.id) != null) {
            throw ValidateException(406, "该用户已是组成员")
        }
        val memberId = userGroupRepository.addMember(group.id, user.id)
        operationLogService.log("group.member.add", "user_group", group.id, "将 ${user.username} 加入组 ${group.name}")
        result.apply {
            id = memberId
            userId = user.id
            username = user.username
            displayName = user.displayName
            avatar = user.avatar
        }
    }
}

/** 移除组成员 */
@Service
class RemoveGroupMemberCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<RemoveGroupMemberCommand, tech.eflink.wiki.core.communication.EmptyResult>() {

    override fun validate(command: RemoveGroupMemberCommand) = requireSystemAdmin()

    override fun handle(command: RemoveGroupMemberCommand, result: tech.eflink.wiki.core.communication.EmptyResult) {
        val group = userGroupRepository.findById(command.id) ?: throw ValidateException(406, "用户组不存在")
        userGroupRepository.removeMember(group.id, command.memberId)
        operationLogService.log("group.member.remove", "user_group", group.id, "移除组成员 ${command.memberId}")
    }
}

private fun fill(group: tech.eflink.wiki.database.tables.records.UserGroupRecord, result: UserGroupResult) {
    result.apply {
        id = group.id
        name = group.name
        description = group.description
        source = group.source
        externalDn = group.externalDn
        createdAt = DtoMappers.epoch(group.createdAt)
    }
}
