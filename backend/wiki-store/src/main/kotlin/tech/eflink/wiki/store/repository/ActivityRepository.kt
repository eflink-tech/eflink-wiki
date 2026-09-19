package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_ACTIVITY as ACTIVITY

/** 活动流水数据访问（浏览计数与后续统计来源） */
@Repository
class ActivityRepository(private val dsl: DSLContext) {

    /** 动作：1 浏览 2 编辑 3 发布 4 恢复 */
    fun insert(nodeId: Long, spaceId: Long, userId: Long, action: Int) {
        dsl.insertInto(ACTIVITY)
            .set(ACTIVITY.NODE_ID, nodeId)
            .set(ACTIVITY.SPACE_ID, spaceId)
            .set(ACTIVITY.USER_ID, userId)
            .set(ACTIVITY.ACTION, action)
            .execute()
    }

    fun countViews(nodeId: Long): Long =
        dsl.fetchCount(dsl.selectOne().from(ACTIVITY).where(ACTIVITY.NODE_ID.eq(nodeId)).and(ACTIVITY.ACTION.eq(1)))
            .toLong()

    /** 正在编辑的其他用户姓名（minutes 分钟内有编辑心跳，去重） */
    fun recentEditors(nodeId: Long, excludeUserId: Long, minutes: Int): List<String> {
        val userIds = dsl.selectDistinct(ACTIVITY.USER_ID)
            .from(ACTIVITY)
            .where(ACTIVITY.NODE_ID.eq(nodeId))
            .and(ACTIVITY.ACTION.eq(2))
            .and(ACTIVITY.USER_ID.ne(excludeUserId))
            .and(ACTIVITY.CREATED_AT.greaterOrEqual(java.time.LocalDateTime.now().minusMinutes(minutes.toLong())))
            .fetch(ACTIVITY.USER_ID)
        if (userIds.isEmpty()) return emptyList()
        return dsl.selectFrom(tech.eflink.wiki.database.Tables.USER)
            .where(tech.eflink.wiki.database.Tables.USER.ID.`in`(userIds))
            .fetch()
            .map { it.displayName }
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(ACTIVITY).where(ACTIVITY.NODE_ID.`in`(nodeIds)).execute()
    }
}
