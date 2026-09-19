package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping

/** 通知项 */
class NotificationItemResult : DataTransferObjectBase() {
    var id: Long = 0
    /** 1 页面被评论 2 评论被回复 3 被@提及 */
    var type: Int = 0
    var title: String = ""
    var spaceId: Long = 0
    var nodeId: Long = 0
    var commentId: Long = 0
    var isRead: Boolean = false
    var createdAt: Long? = null
}

class NotificationListResult : DataTransferObjectBase() {
    var list: MutableList<NotificationItemResult> = mutableListOf()
    var unread: Long = 0
    var hasMore: Boolean = false
}

class MarkNotificationsReadRequest(val ids: List<Long> = emptyList(), val all: Boolean = false)

class ListNotificationsCommand(val page: Int = 1, val size: Int = 20) : CommandObjectBase<NotificationListResult>()

class MarkNotificationsReadCommand(val request: MarkNotificationsReadRequest) :
    CommandObjectBase<tech.eflink.wiki.core.communication.EmptyResult>()

@Tag(name = "知识库-通知", description = "站内通知：列表、未读数、标记已读")
interface NotificationRestfulService {

    @Operation(summary = "通知列表", description = "当前用户的通知，新在前；附带未读数")
    @GetMapping("/notifications")
    fun list(
        @org.springframework.web.bind.annotation.RequestParam(required = false) page: Int? = 1,
        @org.springframework.web.bind.annotation.RequestParam(required = false) size: Int? = 20
    ): Result<NotificationListResult>

    @Operation(summary = "标记已读", description = "ids 指定单条/多条；all=true 全部已读")
    @PostMapping("/notifications/read")
    fun markRead(@RequestBody request: MarkNotificationsReadRequest): Result<tech.eflink.wiki.core.communication.EmptyResult>
}
