package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.contract.wiki.ListNotificationsCommand
import tech.eflink.wiki.contract.wiki.MarkNotificationsReadCommand
import tech.eflink.wiki.contract.wiki.MarkNotificationsReadRequest
import tech.eflink.wiki.contract.wiki.NotificationItemResult
import tech.eflink.wiki.contract.wiki.NotificationListResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.store.repository.NotificationRepository

/** 通知列表（当前用户，新在前）+ 未读数 */
@Service
class ListNotificationsCommandHandler(
    private val notificationRepository: NotificationRepository
) : CommandHandlerBase<ListNotificationsCommand, NotificationListResult>() {

    override fun handle(command: ListNotificationsCommand, result: NotificationListResult) {
        val userId = AuthContext.currentUserId()
        val size = command.size.coerceIn(1, 50)
        val page = command.page.coerceAtLeast(1)
        val records = notificationRepository.listByUser(userId, (page - 1).toLong() * size, size.toLong())
        result.list = records.map { record ->
            NotificationItemResult().apply {
                id = record.id
                type = record.type.toInt()
                title = record.title
                isRead = record.isRead == 1
                createdAt = tech.eflink.wiki.app.impl.DtoMappers.epoch(record.createdAt)
                // payload: {"spaceId":..,"nodeId":..,"commentId":..}
                runCatching {
                    if (!record.payload.isNullOrBlank()) {
                        val json = com.fasterxml.jackson.databind.ObjectMapper().readTree(record.payload)
                        spaceId = json.path("spaceId").asLong(0)
                        nodeId = json.path("nodeId").asLong(0)
                        commentId = json.path("commentId").asLong(0)
                    }
                }
            }
        }.toMutableList()
        result.unread = notificationRepository.countUnread(userId)
        result.hasMore = records.size == size
    }
}

/** 标记已读（指定 ids 或全部） */
@Service
class MarkNotificationsReadCommandHandler(
    private val notificationRepository: NotificationRepository
) : CommandHandlerBase<MarkNotificationsReadCommand, EmptyResult>() {

    override fun handle(command: MarkNotificationsReadCommand, result: EmptyResult) {
        val userId = AuthContext.currentUserId()
        val request: MarkNotificationsReadRequest = command.request
        if (request.all) {
            notificationRepository.markAllRead(userId)
        } else {
            notificationRepository.markRead(userId, request.ids.filter { it > 0 })
        }
    }
}
