package tech.eflink.wiki.contract.admin

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

// ==================== DTO ====================

/** 用户组（管理后台） */
class UserGroupResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var description: String? = null
    var source: Int = 1            // 1 手动创建 2 LDAP 同步
    var externalDn: String? = null
    var memberCount: Long = 0
    var spaceCount: Long = 0       // 被授权的空间数
    var createdAt: Long? = null
}

class UserGroupPageResult : DataTransferObjectBase() {
    var page: Int = 1
    var size: Int = 20
    var total: Long = 0
    var list: MutableList<UserGroupResult> = mutableListOf()
}

/** 组创建/更新请求 */
data class UserGroupUpsertRequest(val name: String = "", val description: String? = null)

/** 组成员项 */
class GroupMemberResult : DataTransferObjectBase() {
    var id: Long = 0               // 关系行ID
    var userId: Long = 0
    var username: String = ""
    var displayName: String = ""
    var avatar: String? = null
    var createdAt: Long? = null
}

class GroupMemberListResult : DataTransferObjectBase() {
    var list: MutableList<GroupMemberResult> = mutableListOf()
}

/** 添加组成员请求 */
data class GroupMemberAddRequest(val userId: Long = 0)

// ==================== 命令 ====================

data class ListUserGroupsRequest(val keyword: String? = null, val page: Int = 1, val size: Int = 20)

class ListUserGroupsCommand(val request: ListUserGroupsRequest) : CommandObjectBase<UserGroupPageResult>()

class CreateUserGroupCommand(val request: UserGroupUpsertRequest) : CommandObjectBase<UserGroupResult>()

class UpdateUserGroupCommand(val id: Long, val request: UserGroupUpsertRequest) : CommandObjectBase<UserGroupResult>()

class DeleteUserGroupCommand(val id: Long) : CommandObjectBase<EmptyResult>()

class ListGroupMembersCommand(val id: Long) : CommandObjectBase<GroupMemberListResult>()

class AddGroupMemberCommand(val id: Long, val request: GroupMemberAddRequest) : CommandObjectBase<GroupMemberResult>()

class RemoveGroupMemberCommand(val id: Long, val memberId: Long) : CommandObjectBase<EmptyResult>()

// ==================== REST 契约 ====================

@Tag(name = "管理后台-用户组", description = "用户组管理与组成员维护；空间授权在各空间设置中操作")
interface AdminUserGroupRestfulService {

    @Operation(summary = "组分页列表", description = "keyword 匹配组名/描述")
    @GetMapping
    fun list(
        @Parameter(description = "关键字") @RequestParam(required = false) keyword: String?,
        @Parameter(description = "页码") @RequestParam(defaultValue = "1") page: Int,
        @Parameter(description = "每页条数") @RequestParam(defaultValue = "20") size: Int
    ): Result<UserGroupPageResult>

    @Operation(summary = "创建组", description = "手动创建组（source=1）")
    @PostMapping
    fun create(@RequestBody request: UserGroupUpsertRequest): Result<UserGroupResult>

    @Operation(summary = "更新组", description = "改名/改描述；LDAP 同步组也可改，但下次同步可能被覆盖命名")
    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody request: UserGroupUpsertRequest): Result<UserGroupResult>

    @Operation(summary = "删除组", description = "软删组并清理组成员关系与空间授权")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): Result<EmptyResult>

    @Operation(summary = "组成员列表")
    @GetMapping("/{id}/members")
    fun members(@PathVariable id: Long): Result<GroupMemberListResult>

    @Operation(summary = "添加组成员", description = "按用户ID添加，已是成员时报错")
    @PostMapping("/{id}/members")
    fun addMember(@PathVariable id: Long, @RequestBody request: GroupMemberAddRequest): Result<GroupMemberResult>

    @Operation(summary = "移除组成员", description = "按关系行ID移除；LDAP 同步组中被移除的用户下次登录会自动加回")
    @DeleteMapping("/{id}/members/{memberId}")
    fun removeMember(@PathVariable id: Long, @PathVariable memberId: Long): Result<EmptyResult>
}
