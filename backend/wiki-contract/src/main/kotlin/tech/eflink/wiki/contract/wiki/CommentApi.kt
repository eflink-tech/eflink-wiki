package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody

/** 评论 */
class CommentResult : DataTransferObjectBase() {
    var id: Long = 0
    var nodeId: Long = 0
    var parentId: Long = 0
    var content: String = ""
    var userId: Long = 0
    var username: String = ""
    var displayName: String = ""
    var avatar: String? = null
    var createdAt: Long? = null
}

class CommentListResult : DataTransferObjectBase() {
    var list: MutableList<CommentResult> = mutableListOf()
}

data class AddCommentRequest(val content: String = "", val parentId: Long = 0, val mentionUserIds: List<Long> = emptyList())

class ListCommentsCommand(val nodeId: Long) : CommandObjectBase<CommentListResult>()

class AddCommentCommand(val nodeId: Long, val request: AddCommentRequest) : CommandObjectBase<CommentResult>()

class DeleteCommentCommand(val commentId: Long) : CommandObjectBase<tech.eflink.wiki.core.communication.EmptyResult>()

@Tag(name = "知识库-评论", description = "页面评论：查看、发表、删除（本人或空间管理员/系统管理员）")
interface CommentRestfulService {

    @Operation(summary = "评论列表")
    @GetMapping("/{id}/comments")
    fun list(@PathVariable id: Long): Result<CommentListResult>

    @Operation(summary = "发表评论", description = "viewer 及以上可评论；parentId 支持楼中楼")
    @PostMapping("/{id}/comments")
    fun add(
        @PathVariable id: Long,
        @RequestBody request: AddCommentRequest
    ): Result<CommentResult>
}

/** 评论删除端点（路径基与查询/发表不同，独立成控制器） */
@Tag(name = "知识库-评论", description = "评论删除")
interface CommentDeleteRestfulService {

    @Operation(summary = "删除评论", description = "仅评论本人、空间管理员或系统管理员")
    @DeleteMapping("/api/wiki/comments/{commentId}")
    fun delete(@PathVariable commentId: Long): Result<tech.eflink.wiki.core.communication.EmptyResult>
}
