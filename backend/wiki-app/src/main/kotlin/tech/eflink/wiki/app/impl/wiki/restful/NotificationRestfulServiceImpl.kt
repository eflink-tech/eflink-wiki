package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.contract.wiki.ListNotificationsCommand
import tech.eflink.wiki.contract.wiki.MarkNotificationsReadCommand
import tech.eflink.wiki.contract.wiki.MarkNotificationsReadRequest
import tech.eflink.wiki.contract.wiki.NotificationListResult
import tech.eflink.wiki.contract.wiki.NotificationRestfulService
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/wiki")
class NotificationRestfulServiceImpl : NotificationRestfulService {

    override fun list(
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?
    ): Result<NotificationListResult> =
        ListNotificationsCommand(page ?: 1, size ?: 20).executeWithResult()

    override fun markRead(@RequestBody request: MarkNotificationsReadRequest): Result<EmptyResult> =
        MarkNotificationsReadCommand(request).executeWithResult()
}
