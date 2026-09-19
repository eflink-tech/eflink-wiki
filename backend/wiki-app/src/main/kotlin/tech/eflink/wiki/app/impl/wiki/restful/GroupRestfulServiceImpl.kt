package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.admin.handler.AddGroupMemberCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.CreateUserGroupCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.DeleteUserGroupCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.ListGroupMembersCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.ListUserGroupsCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.RemoveGroupMemberCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.UpdateUserGroupCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.AddSpaceGroupCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListGroupOptionsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListSpaceGroupsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.RemoveSpaceGroupCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.SearchUsersCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UpdateSpaceGroupCommandHandler
import tech.eflink.wiki.contract.admin.AddGroupMemberCommand
import tech.eflink.wiki.contract.admin.AdminUserGroupRestfulService
import tech.eflink.wiki.contract.admin.CreateUserGroupCommand
import tech.eflink.wiki.contract.admin.DeleteUserGroupCommand
import tech.eflink.wiki.contract.admin.GroupMemberAddRequest
import tech.eflink.wiki.contract.admin.GroupMemberListResult
import tech.eflink.wiki.contract.admin.GroupMemberResult
import tech.eflink.wiki.contract.admin.ListGroupMembersCommand
import tech.eflink.wiki.contract.admin.ListUserGroupsCommand
import tech.eflink.wiki.contract.admin.ListUserGroupsRequest
import tech.eflink.wiki.contract.admin.RemoveGroupMemberCommand
import tech.eflink.wiki.contract.admin.UpdateUserGroupCommand
import tech.eflink.wiki.contract.admin.UserGroupPageResult
import tech.eflink.wiki.contract.admin.UserGroupResult
import tech.eflink.wiki.contract.admin.UserGroupUpsertRequest
import tech.eflink.wiki.contract.wiki.AddSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.ListGroupOptionsCommand
import tech.eflink.wiki.contract.wiki.ListSpaceGroupsCommand
import tech.eflink.wiki.contract.wiki.RemoveSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.SearchUsersCommand
import tech.eflink.wiki.contract.wiki.SpaceGroupListResult
import tech.eflink.wiki.contract.wiki.SpaceGroupRestfulService
import tech.eflink.wiki.contract.wiki.SpaceGroupResult
import tech.eflink.wiki.contract.wiki.SpaceGroupRoleRequest
import tech.eflink.wiki.contract.wiki.SpaceGroupUpsertRequest
import tech.eflink.wiki.contract.wiki.UpdateSpaceGroupCommand
import tech.eflink.wiki.contract.wiki.UserBriefListResult
import tech.eflink.wiki.contract.wiki.UserGroupOptionListResult
import tech.eflink.wiki.contract.wiki.WikiGroupRestfulService
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

/** 空间组授权（挂在 /api/wiki/spaces 下，与空间成员同构） */
@RestController
@RequestMapping("/api/wiki/spaces")
class SpaceGroupRestfulServiceImpl : SpaceGroupRestfulService {

    override fun list(@PathVariable id: Long): Result<SpaceGroupListResult> =
        ListSpaceGroupsCommand(id).executeWithResult()

    override fun add(@PathVariable id: Long, @RequestBody request: SpaceGroupUpsertRequest): Result<SpaceGroupResult> =
        AddSpaceGroupCommand(id, request).executeWithResult()

    override fun updateRole(
        @PathVariable id: Long,
        @PathVariable grantId: Long,
        @RequestBody request: SpaceGroupRoleRequest
    ): Result<EmptyResult> = UpdateSpaceGroupCommand(id, grantId, request).executeWithResult()

    override fun remove(@PathVariable id: Long, @PathVariable grantId: Long): Result<EmptyResult> =
        RemoveSpaceGroupCommand(id, grantId).executeWithResult()
}

/** 登录用户可用的组列表与用户搜索 */
@RestController
@RequestMapping("/api/wiki")
class WikiGroupRestfulServiceImpl : WikiGroupRestfulService {

    override fun groups(): Result<UserGroupOptionListResult> = ListGroupOptionsCommand().executeWithResult()

    override fun searchUsers(@RequestParam keyword: String): Result<UserBriefListResult> =
        SearchUsersCommand(keyword).executeWithResult()
}

/** 管理后台-用户组管理（仅系统管理员） */
@RestController
@RequestMapping("/api/admin/user-groups")
class AdminUserGroupRestfulServiceImpl : AdminUserGroupRestfulService {

    override fun list(
        @RequestParam(required = false) keyword: String?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") size: Int
    ): Result<UserGroupPageResult> =
        ListUserGroupsCommand(ListUserGroupsRequest(keyword, page, size)).executeWithResult()

    override fun create(@RequestBody request: UserGroupUpsertRequest): Result<UserGroupResult> =
        CreateUserGroupCommand(request).executeWithResult()

    override fun update(@PathVariable id: Long, @RequestBody request: UserGroupUpsertRequest): Result<UserGroupResult> =
        UpdateUserGroupCommand(id, request).executeWithResult()

    override fun delete(@PathVariable id: Long): Result<EmptyResult> =
        DeleteUserGroupCommand(id).executeWithResult()

    override fun members(@PathVariable id: Long): Result<GroupMemberListResult> =
        ListGroupMembersCommand(id).executeWithResult()

    override fun addMember(@PathVariable id: Long, @RequestBody request: GroupMemberAddRequest): Result<GroupMemberResult> =
        AddGroupMemberCommand(id, request).executeWithResult()

    override fun removeMember(@PathVariable id: Long, @PathVariable memberId: Long): Result<EmptyResult> =
        RemoveGroupMemberCommand(id, memberId).executeWithResult()
}
