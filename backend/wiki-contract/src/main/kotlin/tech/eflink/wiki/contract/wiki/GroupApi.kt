package tech.eflink.wiki.contract.wiki

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam

// ==================== DTO ====================

/** 空间内的组授权项 */
class SpaceGroupResult : DataTransferObjectBase() {
    var id: Long = 0              // 授权关系ID
    var groupId: Long = 0
    var groupName: String = ""
    var groupSource: Int = 1      // 1 手动 2 LDAP 同步
    var memberCount: Long = 0
    var role: Int = 3             // 1 admin 2 editor 3 viewer
}

class SpaceGroupListResult : DataTransferObjectBase() {
    var list: MutableList<SpaceGroupResult> = mutableListOf()
}

/** 添加组授权请求 */
data class SpaceGroupUpsertRequest(val groupId: Long = 0, val role: Int = 3)

/** 修改组授权角色请求 */
data class SpaceGroupRoleRequest(val role: Int = 3)

/** 组下拉选项（空间管理员授权时选择用，精简字段） */
class UserGroupOptionResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var description: String? = null
    var groupSource: Int = 1
    var memberCount: Long = 0
}

class UserGroupOptionListResult : DataTransferObjectBase() {
    var list: MutableList<UserGroupOptionResult> = mutableListOf()
}

/** 用户精简信息（登录用户互搜/加成员用，不含邮箱等敏感字段） */
class UserBriefResult : DataTransferObjectBase() {
    var id: Long = 0
    var username: String = ""
    var displayName: String = ""
    var avatar: String? = null
}

class UserBriefListResult : DataTransferObjectBase() {
    var list: MutableList<UserBriefResult> = mutableListOf()
}

// ==================== 命令 ====================

class ListSpaceGroupsCommand(val spaceId: Long) : CommandObjectBase<SpaceGroupListResult>()

class AddSpaceGroupCommand(val spaceId: Long, val request: SpaceGroupUpsertRequest) : CommandObjectBase<SpaceGroupResult>()

class UpdateSpaceGroupCommand(val spaceId: Long, val grantId: Long, val request: SpaceGroupRoleRequest) :
    CommandObjectBase<EmptyResult>()

class RemoveSpaceGroupCommand(val spaceId: Long, val grantId: Long) : CommandObjectBase<EmptyResult>()

/** 全部用户组（授权下拉用，精简字段，登录即可访问） */
class ListGroupOptionsCommand : CommandObjectBase<UserGroupOptionListResult>()

/** 按用户名/姓名搜索用户（登录即可访问，返回精简字段） */
class SearchUsersCommand(val keyword: String) : CommandObjectBase<UserBriefListResult>()

// ==================== REST 契约 ====================

@Tag(name = "知识库-空间组授权", description = "空间内的用户组授权（整组按角色授权进空间）")
interface SpaceGroupRestfulService {

    @Operation(summary = "空间的组授权列表")
    @GetMapping("/{id}/groups")
    fun list(@Parameter(description = "空间ID") @PathVariable id: Long): Result<SpaceGroupListResult>

    @Operation(summary = "添加组授权", description = "仅空间管理员可操作；role: 1 admin 2 editor 3 viewer")
    @PostMapping("/{id}/groups")
    fun add(
        @PathVariable id: Long,
        @RequestBody request: SpaceGroupUpsertRequest
    ): Result<SpaceGroupResult>

    @Operation(summary = "修改组授权角色", description = "仅空间管理员可操作")
    @PutMapping("/{id}/groups/{grantId}")
    fun updateRole(
        @PathVariable id: Long,
        @PathVariable grantId: Long,
        @RequestBody request: SpaceGroupRoleRequest
    ): Result<EmptyResult>

    @Operation(summary = "移除组授权", description = "仅空间管理员可操作；组内成员随即失去对应空间权限")
    @DeleteMapping("/{id}/groups/{grantId}")
    fun remove(
        @PathVariable id: Long,
        @PathVariable grantId: Long
    ): Result<EmptyResult>
}

@Tag(name = "知识库-用户/组查询", description = "登录用户可用的精简用户搜索与组列表（加成员/授权下拉）")
interface WikiGroupRestfulService {

    @Operation(summary = "用户组列表", description = "全部未删除组（精简字段），供授权下拉选择")
    @GetMapping("/groups")
    fun groups(): Result<UserGroupOptionListResult>

    @Operation(summary = "搜索用户", description = "按用户名/姓名模糊搜索，返回精简字段，最多 20 条")
    @GetMapping("/users")
    fun searchUsers(
        @Parameter(description = "关键字") @RequestParam keyword: String
    ): Result<UserBriefListResult>
}
