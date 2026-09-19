package tech.eflink.wiki.contract.admin

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam

/** 审计日志项 */
class OperationLogResult : DataTransferObjectBase() {
    var id: Long = 0
    var userId: Long = 0
    var username: String = ""
    var action: String = ""
    var targetType: String? = null
    var targetId: String? = null
    var detail: String? = null
    var ip: String? = null
    var createdAt: Long? = null
}

class OperationPageResult : DataTransferObjectBase() {
    var list: MutableList<OperationLogResult> = mutableListOf()
    var total: Long = 0
    var page: Int = 1
    var size: Int = 20
}

data class OperationListRequest(
    val action: String? = null,
    val userId: Long? = null,
    val page: Int = 1,
    val size: Int = 20
)

class ListOperationsCommand(val request: OperationListRequest) : CommandObjectBase<OperationPageResult>()

@Tag(name = "管理后台-审计日志", description = "登录/发布/删除/成员变更/用户管理等操作审计查询")
interface AdminOperationRestfulService {

    @Operation(summary = "审计日志列表", description = "按动作/操作人过滤，分页返回")
    @GetMapping
    fun list(
        @Parameter(description = "动作过滤") @RequestParam(required = false) action: String?,
        @Parameter(description = "操作人ID") @RequestParam(required = false) userId: Long?,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") size: Int
    ): Result<OperationPageResult>
}
