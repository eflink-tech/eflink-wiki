package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.jooq.impl.SQLDataType
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_ACTIVITY as ACTIVITY
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.Tables.WIKI_VERSION as VERSION
import tech.eflink.wiki.database.Tables.USER

/** 空间统计聚合查询 */
@Repository
class StatsRepository(private val dsl: DSLContext) {

    /** 近 N 天每日浏览趋势（无浏览的日期由调用方补 0） */
    fun dailyViews(spaceId: Long, days: Int): List<Pair<String, Long>> {
        val dateExpr = DSL.function("DATE", SQLDataType.DATE, ACTIVITY.CREATED_AT)
        return dsl.select(dateExpr, DSL.count())
            .from(ACTIVITY)
            .where(ACTIVITY.SPACE_ID.eq(spaceId))
            .and(ACTIVITY.ACTION.eq(1))
            .and(ACTIVITY.CREATED_AT.greaterOrEqual(DSL.currentLocalDateTime().minus(days.toLong())))
            .groupBy(dateExpr)
            .orderBy(dateExpr)
            .fetch { it.value1().toString() to it.value2().toLong() }
    }

    /** 发布贡献榜（发布次数 + 浏览按人聚合） */
    fun contributors(spaceId: Long): List<Map<String, Any?>> {
        val publishCount = DSL.count(ACTIVITY.ID).filterWhere(ACTIVITY.ACTION.eq(3))
        val viewCount = DSL.count(ACTIVITY.ID).filterWhere(ACTIVITY.ACTION.eq(1))
        return dsl.select(
            ACTIVITY.USER_ID, USER.DISPLAY_NAME, publishCount, viewCount
        )
            .from(ACTIVITY)
            .join(USER).on(USER.ID.eq(ACTIVITY.USER_ID))
            .where(ACTIVITY.SPACE_ID.eq(spaceId))
            .groupBy(ACTIVITY.USER_ID, USER.DISPLAY_NAME)
            .orderBy(publishCount.desc(), viewCount.desc())
            .limit(10)
            .fetch { record ->
                mapOf(
                    "userId" to record.getValue(ACTIVITY.USER_ID),
                    "displayName" to record.getValue(USER.DISPLAY_NAME),
                    "publishes" to record.getValue(2, Long::class.java),
                    "views" to record.getValue(3, Long::class.java)
                )
            }
    }

    /** 空间总浏览量 */
    fun totalViews(spaceId: Long): Long =
        dsl.fetchCount(
            dsl.selectOne().from(ACTIVITY)
                .where(ACTIVITY.SPACE_ID.eq(spaceId)).and(ACTIVITY.ACTION.eq(1))
        ).toLong()

    /** 空间发布版本总数 */
    fun versionCount(spaceId: Long): Long =
        dsl.fetchCount(
            dsl.selectOne().from(VERSION)
                .join(NODE).on(NODE.ID.eq(VERSION.NODE_ID))
                .where(NODE.SPACE_ID.eq(spaceId))
        ).toLong()
}
