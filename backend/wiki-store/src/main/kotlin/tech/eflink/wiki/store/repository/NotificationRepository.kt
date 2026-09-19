package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.NOTIFICATION
import tech.eflink.wiki.database.tables.records.NotificationRecord

/** 站内通知数据访问 */
@Repository
class NotificationRepository(private val dsl: DSLContext) {

    fun create(userId: Long, type: Int, title: String, payload: String?): Long =
        dsl.insertInto(NOTIFICATION)
            .set(NOTIFICATION.USER_ID, userId)
            .set(NOTIFICATION.TYPE, type)
            .set(NOTIFICATION.TITLE, title)
            .set(NOTIFICATION.PAYLOAD, payload)
            .returningResult(NOTIFICATION.ID)
            .fetchOne()!!.value1()

    /** 通知列表（新在前，分页） */
    fun listByUser(userId: Long, offset: Long, limit: Long): List<NotificationRecord> =
        dsl.selectFrom(NOTIFICATION)
            .where(NOTIFICATION.USER_ID.eq(userId))
            .orderBy(NOTIFICATION.ID.desc())
            .offset(offset)
            .limit(limit)
            .fetch()

    fun countUnread(userId: Long): Long =
        dsl.fetchCount(
            dsl.selectFrom(NOTIFICATION)
                .where(NOTIFICATION.USER_ID.eq(userId)).and(NOTIFICATION.IS_READ.eq(0))
        ).toLong()

    fun markRead(userId: Long, ids: List<Long>) {
        if (ids.isEmpty()) return
        dsl.update(NOTIFICATION)
            .set(NOTIFICATION.IS_READ, 1)
            .where(NOTIFICATION.USER_ID.eq(userId)).and(NOTIFICATION.ID.`in`(ids))
            .execute()
    }

    fun markAllRead(userId: Long) {
        dsl.update(NOTIFICATION)
            .set(NOTIFICATION.IS_READ, 1)
            .where(NOTIFICATION.USER_ID.eq(userId)).and(NOTIFICATION.IS_READ.eq(0))
            .execute()
    }
}
