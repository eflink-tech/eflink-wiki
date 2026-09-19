package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.OperationLogService
import tech.eflink.wiki.contract.wiki.ListGroupOptionsCommand
import tech.eflink.wiki.contract.wiki.ListSpaceGroupsCommand
import tech.eflink.wiki.contract.wiki.AddSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.RemoveSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.SearchUsersCommand
import tech.eflink.wiki.contract.wiki.SpaceGroupListResult
import tech.eflink.wiki.contract.wiki.SpaceGroupResult
import tech.eflink.wiki.contract.wiki.UpdateSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.UserBriefListResult
import tech.eflink.wiki.contract.wiki.UserBriefResult
import tech.eflink.wiki.contract.wiki.UserGroupOptionListResult
import tech.eflink.wiki.contract.wiki.UserGroupOptionResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.UserGroupRepository
import tech.eflink.wiki.store.repository.UserRepository

/** 空间内的组授权列表（查看者即可读，与成员列表一致） */
@Service
class ListSpaceGroupsCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ListSpaceGroupsCommand, SpaceGroupListResult>() {

    override fun handle(command: ListSpaceGroupsCommand, result: SpaceGroupListResult) {
        guard.requireSpaceRole(command.spaceId, 3)
        result.list = userGroupRepository.listBySpace(command.spaceId)
            .map { row ->
                SpaceGroupResult().apply {
                    id = row.grant.id
                    groupId = row.grant.groupId
                    groupName = row.groupName
                    groupSource = row.groupSource
                    memberCount = row.memberCount
                    role = row.grant.role
                }
            }
            .toMutableList()
    }
}

/** 添加组授权（仅空间管理员） */
@Service
class AddSpaceGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val guard: WikiGuard,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<AddSpaceGroupCommand, SpaceGroupResult>() {

    override fun validate(command: AddSpaceGroupCommand) {
        require(command.request.role in 1..3) { "角色取值不合法" }
        require(command.request.groupId > 0) { "请选择要授权的用户组" }
    }

    override fun handle(command: AddSpaceGroupCommand, result: SpaceGroupResult) {
        guard.requireSpaceRole(command.spaceId, 1)
        val group = userGroupRepository.findById(command.request.groupId)
            ?: throw ValidateException(406, "用户组不存在")
        if (userGroupRepository.findBySpaceAndGroup(command.spaceId, group.id) != null) {
            throw ValidateException(406, "该用户组已授权到本空间")
        }
        val grantId = userGroupRepository.grant(command.spaceId, group.id, command.request.role)
        operationLogService.log("space.group.grant", "space", command.spaceId, "组「${group.name}」以角色 ${command.request.role} 授权")
        result.apply {
            id = grantId
            groupId = group.id
            groupName = group.name
            groupSource = group.source
            memberCount = userGroupRepository.countMembers(group.id)
            role = command.request.role
        }
    }
}

/** 修改组授权角色（仅空间管理员） */
@Service
class UpdateSpaceGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val guard: WikiGuard,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<UpdateSpaceGroupCommand, tech.eflink.wiki.core.communication.EmptyResult>() {

    override fun validate(command: UpdateSpaceGroupCommand) {
        require(command.request.role in 1..3) { "角色取值不合法" }
    }

    override fun handle(command: UpdateSpaceGroupCommand, result: tech.eflink.wiki.core.communication.EmptyResult) {
        guard.requireSpaceRole(command.spaceId, 1)
        val grant = userGroupRepository.findGrantById(command.grantId)
            ?: throw ValidateException(406, "授权关系不存在")
        if (grant.spaceId != command.spaceId) throw ValidateException(406, "授权关系不属于该空间")
        userGroupRepository.updateGrantRole(grant.id, command.request.role)
        operationLogService.log("space.group.role", "space", command.spaceId, "组授权 $grant.id 角色改为 ${command.request.role}")
    }
}

/** 移除组授权（仅空间管理员） */
@Service
class RemoveSpaceGroupCommandHandler(
    private val userGroupRepository: UserGroupRepository,
    private val guard: WikiGuard,
    private val operationLogService: OperationLogService
) : CommandHandlerBase<RemoveSpaceGroupCommand, tech.eflink.wiki.core.communication.EmptyResult>() {

    override fun handle(command: RemoveSpaceGroupCommand, result: tech.eflink.wiki.core.communication.EmptyResult) {
        guard.requireSpaceRole(command.spaceId, 1)
        val grant = userGroupRepository.findGrantById(command.grantId)
            ?: throw ValidateException(406, "授权关系不存在")
        if (grant.spaceId != command.spaceId) throw ValidateException(406, "授权关系不属于该空间")
        userGroupRepository.revoke(grant.id)
        operationLogService.log("space.group.revoke", "space", command.spaceId, "移除组授权 ${grant.id}")
    }
}

/** 用户组下拉列表（登录即可访问，授权/加成员时选择用） */
@Service
class ListGroupOptionsCommandHandler(
    private val userGroupRepository: UserGroupRepository
) : CommandHandlerBase<ListGroupOptionsCommand, UserGroupOptionListResult>() {

    override fun handle(command: ListGroupOptionsCommand, result: UserGroupOptionListResult) {
        AuthContext.currentUserId()
        result.list = userGroupRepository.page(null, 0, 200)
            .map { row ->
                UserGroupOptionResult().apply {
                    id = row.group.id
                    name = row.group.name
                    description = row.group.description
                    groupSource = row.group.source
                    memberCount = row.memberCount
                }
            }
            .toMutableList()
    }
}

/** 用户搜索（登录即可访问；只返回精简字段，供加成员时选人） */
@Service
class SearchUsersCommandHandler(
    private val userRepository: UserRepository
) : CommandHandlerBase<SearchUsersCommand, UserBriefListResult>() {

    override fun handle(command: SearchUsersCommand, result: UserBriefListResult) {
        val keyword = command.keyword.trim()
        if (keyword.isEmpty()) return
        AuthContext.currentUserId()
        result.list = userRepository.page(keyword, 0, 20)
            .map { u ->
                UserBriefResult().apply {
                    id = u.id
                    username = u.username
                    displayName = u.displayName
                    avatar = u.avatar
                }
            }
            .toMutableList()
    }
}
