package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.Tables.WIKI_COMMENT as COMMENT
import tech.eflink.wiki.database.tables.records.WikiCommentRecord

/** 页面评论数据访问 */
@Repository
class CommentRepository(private val dsl: DSLContext) {

    /** 评论列表（附评论人信息），旧评论在前 */
    fun listByNode(nodeId: Long): List<Map<String, Any?>> =
        dsl.select(
            COMMENT.ID, COMMENT.PARENT_ID, COMMENT.CONTENT, COMMENT.CREATED_AT,
            COMMENT.USER_ID, USER.USERNAME, USER.DISPLAY_NAME, USER.AVATAR
        )
            .from(COMMENT)
            .join(USER).on(USER.ID.eq(COMMENT.USER_ID))
            .where(COMMENT.NODE_ID.eq(nodeId)).and(COMMENT.IS_DEL.eq(0))
            .orderBy(COMMENT.ID.asc())
            .fetch { record ->
                mapOf(
                    "id" to record.getValue(COMMENT.ID),
                    "parentId" to record.getValue(COMMENT.PARENT_ID),
                    "content" to record.getValue(COMMENT.CONTENT),
                    "createdAt" to record.getValue(COMMENT.CREATED_AT),
                    "userId" to record.getValue(COMMENT.USER_ID),
                    "username" to record.getValue(USER.USERNAME),
                    "displayName" to record.getValue(USER.DISPLAY_NAME),
                    "avatar" to record.getValue(USER.AVATAR)
                )
            }

    fun create(nodeId: Long, userId: Long, parentId: Long, content: String): Long =
        dsl.insertInto(COMMENT)
            .set(COMMENT.NODE_ID, nodeId)
            .set(COMMENT.USER_ID, userId)
            .set(COMMENT.PARENT_ID, parentId)
            .set(COMMENT.CONTENT, content)
            .returningResult(COMMENT.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WikiCommentRecord? =
        dsl.selectFrom(COMMENT).where(COMMENT.ID.eq(id)).and(COMMENT.IS_DEL.eq(0)).fetchOne()

    fun softDelete(id: Long) {
        dsl.update(COMMENT).set(COMMENT.IS_DEL, 1).where(COMMENT.ID.eq(id)).execute()
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(COMMENT).where(COMMENT.NODE_ID.`in`(nodeIds)).execute()
    }
}
