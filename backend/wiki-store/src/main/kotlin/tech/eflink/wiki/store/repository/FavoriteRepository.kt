package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_FAVORITE as FAVORITE
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.Tables.WIKI_SPACE as SPACE
import tech.eflink.wiki.database.tables.records.WikiFavoriteRecord

/** 页面收藏数据访问 */
@Repository
class FavoriteRepository(private val dsl: DSLContext) {

    fun findByUserAndNode(userId: Long, nodeId: Long): WikiFavoriteRecord? =
        dsl.selectFrom(FAVORITE)
            .where(FAVORITE.USER_ID.eq(userId)).and(FAVORITE.NODE_ID.eq(nodeId))
            .fetchOne()

    fun insert(userId: Long, nodeId: Long) {
        dsl.insertInto(FAVORITE)
            .set(FAVORITE.USER_ID, userId)
            .set(FAVORITE.NODE_ID, nodeId)
            .execute()
    }

    fun delete(userId: Long, nodeId: Long) {
        dsl.deleteFrom(FAVORITE)
            .where(FAVORITE.USER_ID.eq(userId)).and(FAVORITE.NODE_ID.eq(nodeId))
            .execute()
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(FAVORITE).where(FAVORITE.NODE_ID.`in`(nodeIds)).execute()
    }

    /** 我的收藏（排除已删除页面/空间），新收藏在前 */
    fun listByUser(userId: Long): List<Map<String, Any?>> =
        dsl.select(
            FAVORITE.NODE_ID, FAVORITE.CREATED_AT,
            NODE.TITLE, NODE.SPACE_ID,
            SPACE.NAME.`as`("space_name")
        )
            .from(FAVORITE)
            .join(NODE).on(NODE.ID.eq(FAVORITE.NODE_ID)).and(NODE.IS_DEL.eq(0))
            .join(SPACE).on(SPACE.ID.eq(NODE.SPACE_ID)).and(SPACE.IS_DEL.eq(0))
            .where(FAVORITE.USER_ID.eq(userId))
            .orderBy(FAVORITE.CREATED_AT.desc())
            .fetch { record ->
                mapOf(
                    "nodeId" to record.getValue(FAVORITE.NODE_ID),
                    "spaceId" to record.getValue(NODE.SPACE_ID),
                    "title" to record.getValue(NODE.TITLE),
                    "spaceName" to record.getValue("space_name") as String?,
                    "createdAt" to record.getValue(FAVORITE.CREATED_AT)
                )
            }
}
