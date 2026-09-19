package tech.eflink.wiki.contract.open

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam

/** 开放接口返回结构（只读，供外部系统聚合搜索/展示） */

class OpenSpaceResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var description: String? = null
    var nodeCount: Long = 0
    var updatedAt: Long? = null
}

class OpenSpaceListResult : DataTransferObjectBase() {
    var list: MutableList<OpenSpaceResult> = mutableListOf()
}

class OpenTreeNodeResult : DataTransferObjectBase() {
    var id: Long = 0
    var parentId: Long = 0
    var title: String = ""
    var children: MutableList<OpenTreeNodeResult> = mutableListOf()
}

class OpenTreeResult : DataTransferObjectBase() {
    var spaceId: Long = 0
    var nodes: MutableList<OpenTreeNodeResult> = mutableListOf()
}

class OpenNodeResult : DataTransferObjectBase() {
    var id: Long = 0
    var spaceId: Long = 0
    var title: String = ""
    var versionNo: Int? = null
    var content: String? = null
    var publishedAt: Long? = null
}

class OpenSearchItemResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var spaceName: String = ""
    var title: String = ""
    var updatedAt: Long? = null
}

class OpenSearchListResult : DataTransferObjectBase() {
    var list: MutableList<OpenSearchItemResult> = mutableListOf()
}

class ListOpenSpacesCommand : CommandObjectBase<OpenSpaceListResult>()

class GetOpenTreeCommand(val spaceId: Long) : CommandObjectBase<OpenTreeResult>()

class GetOpenNodeCommand(val nodeId: Long) : CommandObjectBase<OpenNodeResult>()

class OpenSearchCommand(val keyword: String, val limit: Int?) : CommandObjectBase<OpenSearchListResult>()

/**
 * 只读开放接口（X-API-Key 鉴权）：供外部系统/门户聚合知识库内容。
 * 未发布或已删除的页面不返回。
 */
@Tag(name = "开放API", description = "X-API-Key 鉴权的只读接口：空间列表/页面树/已发布页面/全文搜索")
interface OpenRestfulService {

    @Operation(summary = "空间列表", description = "全部未删除空间及页面数")
    @GetMapping("/spaces")
    fun spaces(): Result<OpenSpaceListResult>

    @Operation(summary = "页面树")
    @GetMapping("/spaces/{spaceId}/tree")
    fun tree(@PathVariable spaceId: Long): Result<OpenTreeResult>

    @Operation(summary = "已发布页面内容")
    @GetMapping("/nodes/{nodeId}")
    fun node(@PathVariable nodeId: Long): Result<OpenNodeResult>

    @Operation(summary = "全文搜索", description = "标题+已发布正文检索，limit 默认 20 上限 50")
    @GetMapping("/search")
    fun search(
        @RequestParam q: String,
        @RequestParam(required = false) limit: Int?
    ): Result<OpenSearchListResult>
}
