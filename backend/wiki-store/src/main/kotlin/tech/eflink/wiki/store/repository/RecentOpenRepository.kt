package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.Tables.WIKI_RECENT_OPEN as RECENT
import tech.eflink.wiki.database.Tables.WIKI_SPACE as SPACE

/** 最近打开页面数据访问 */
@Repository
class RecentOpenRepository(private val dsl: DSLContext) {

    /** 记录打开（存在则刷新时间，不存在则插入） */
    fun upsert(userId: Long, nodeId: Long) {
        dsl.insertInto(RECENT)
            .set(RECENT.USER_ID, userId)
            .set(RECENT.NODE_ID, nodeId)
            .set(RECENT.OPENED_AT, java.time.LocalDateTime.now())
            .onDuplicateKeyUpdate()
            .set(RECENT.OPENED_AT, java.time.LocalDateTime.now())
            .execute()
    }

    /** 我的最近打开（排除已删除页面/空间），最近在前，最多 limit 条 */
    fun listByUser(userId: Long, limit: Int): List<Map<String, Any?>> =
        dsl.select(
            RECENT.NODE_ID, RECENT.OPENED_AT,
            NODE.TITLE, NODE.SPACE_ID,
            SPACE.NAME.`as`("space_name")
        )
            .from(RECENT)
            .join(NODE).on(NODE.ID.eq(RECENT.NODE_ID)).and(NODE.IS_DEL.eq(0))
            .join(SPACE).on(SPACE.ID.eq(NODE.SPACE_ID)).and(SPACE.IS_DEL.eq(0))
            .where(RECENT.USER_ID.eq(userId))
            .orderBy(RECENT.OPENED_AT.desc())
            .limit(limit)
            .fetch { record ->
                mapOf(
                    "nodeId" to record.getValue(RECENT.NODE_ID),
                    "spaceId" to record.getValue(NODE.SPACE_ID),
                    "title" to record.getValue(NODE.TITLE),
                    "spaceName" to record.getValue("space_name") as String?,
                    "openedAt" to record.getValue(RECENT.OPENED_AT)
                )
            }
}
