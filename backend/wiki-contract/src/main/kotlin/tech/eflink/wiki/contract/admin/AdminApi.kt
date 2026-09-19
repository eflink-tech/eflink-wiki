package tech.eflink.wiki.contract.admin

import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody

/** 用户分页结果 */
class UserPageResult : DataTransferObjectBase() {
    var list: MutableList<UserResult> = mutableListOf()
    var total: Long = 0
    var page: Int = 1
    var size: Int = 20
}

/** 用户列表查询请求 */
data class UserListRequest(
    val keyword: String? = null,
    val page: Int = 1,
    val size: Int = 20
)

/** 创建用户请求（管理员后台建号，无自助注册） */
data class CreateUserRequest(
    val username: String = "",
    val displayName: String = "",
    val password: String = "",
    val role: Int = 2
)

/** 更新用户请求：姓名/角色/状态/重置密码，均可选 */
data class UpdateUserRequest(
    val displayName: String? = null,
    val role: Int? = null,
    val status: Int? = null,
    val password: String? = null
)

class ListUsersCommand(val request: UserListRequest) : CommandObjectBase<UserPageResult>()

class CreateUserCommand(val request: CreateUserRequest) : CommandObjectBase<UserResult>()

class UpdateUserCommand(val id: Long, val request: UpdateUserRequest) : CommandObjectBase<UserResult>()

class ImportUsersCommand(val file: org.springframework.web.multipart.MultipartFile) :
    CommandObjectBase<ImportUsersResult>()

/** 批量导入结果 */
class ImportUsersResult : DataTransferObjectBase() {
    var created: Int = 0
    var skipped: Int = 0
    var errors: MutableList<String> = mutableListOf()
}

@Tag(name = "管理后台-用户管理", description = "仅系统管理员可用：创建账号、重置密码、调整角色、禁用启用、Excel 批量导入")
interface AdminUserRestfulService {

    @Operation(summary = "用户列表", description = "按关键字（用户名/姓名）模糊搜索，分页返回")
    @GetMapping
    fun list(
        @Parameter(description = "关键字")
        @org.springframework.web.bind.annotation.RequestParam(required = false) keyword: String?,
        @org.springframework.web.bind.annotation.RequestParam(defaultValue = "1") page: Int,
        @org.springframework.web.bind.annotation.RequestParam(defaultValue = "20") size: Int
    ): Result<UserPageResult>

    @Operation(summary = "创建账号", description = "管理员创建账号并设置初始密码，用户名全局唯一")
    @PostMapping
    fun create(@RequestBody request: CreateUserRequest): Result<UserResult>

    @Operation(summary = "更新用户", description = "改姓名/角色/状态，password 非空时重置密码；不允许禁用自己或把最后一个管理员降级")
    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @RequestBody request: UpdateUserRequest
    ): Result<UserResult>

    @Operation(summary = "Excel 批量导入用户", description = "xlsx/csv，列顺序：用户名、姓名、初始密码(可选默认123456)、角色(可选默认普通用户)，首行为表头")
    @PostMapping(value = ["/import"], consumes = [org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE])
    fun importUsers(@org.springframework.web.bind.annotation.RequestPart("file") file: org.springframework.web.multipart.MultipartFile): Result<ImportUsersResult>
}
