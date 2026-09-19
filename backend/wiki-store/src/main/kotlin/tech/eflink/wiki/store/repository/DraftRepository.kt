package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_DRAFT as DRAFT
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.Tables.WIKI_SPACE as SPACE
import tech.eflink.wiki.database.tables.records.WikiDraftRecord

/** 页面草稿数据访问（每节点每人一份） */
@Repository
class DraftRepository(private val dsl: DSLContext) {

    fun findByNodeAndUser(nodeId: Long, userId: Long): WikiDraftRecord? =
        dsl.selectFrom(DRAFT)
            .where(DRAFT.NODE_ID.eq(nodeId)).and(DRAFT.USER_ID.eq(userId))
            .fetchOne()

    /** 有则更新，无则插入 */
    fun upsert(nodeId: Long, userId: Long, content: String, baseVersionId: Long?) {
        val existing = findByNodeAndUser(nodeId, userId)
        if (existing != null) {
            val step = dsl.update(DRAFT).set(DRAFT.CONTENT, content)
            if (baseVersionId != null) step.set(DRAFT.BASE_VERSION_ID, baseVersionId)
            step.where(DRAFT.ID.eq(existing.id)).execute()
        } else {
            dsl.insertInto(DRAFT)
                .set(DRAFT.NODE_ID, nodeId)
                .set(DRAFT.USER_ID, userId)
                .set(DRAFT.CONTENT, content)
                .set(DRAFT.BASE_VERSION_ID, baseVersionId)
                .execute()
        }
    }

    /** 发布后清空该页面全部草稿 */
    fun deleteByNode(nodeId: Long) {
        dsl.deleteFrom(DRAFT).where(DRAFT.NODE_ID.eq(nodeId)).execute()
    }

    /** 仅删除本人的草稿（放弃未发布修改） */
    fun deleteByNodeAndUser(nodeId: Long, userId: Long) {
        dsl.deleteFrom(DRAFT)
            .where(DRAFT.NODE_ID.eq(nodeId)).and(DRAFT.USER_ID.eq(userId))
            .execute()
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(DRAFT).where(DRAFT.NODE_ID.`in`(nodeIds)).execute()
    }

    /** 我的草稿箱（跨空间，排除已删除页面/空间） */
    fun listMyDrafts(userId: Long): List<Map<String, Any?>> =
        dsl.select(
            DRAFT.NODE_ID, DRAFT.UPDATED_AT,
            NODE.TITLE, NODE.SPACE_ID,
            SPACE.NAME.`as`("space_name")
        )
            .from(DRAFT)
            .join(NODE).on(NODE.ID.eq(DRAFT.NODE_ID)).and(NODE.IS_DEL.eq(0))
            .join(SPACE).on(SPACE.ID.eq(NODE.SPACE_ID)).and(SPACE.IS_DEL.eq(0))
            .where(DRAFT.USER_ID.eq(userId))
            .orderBy(DRAFT.UPDATED_AT.desc())
            .fetch { record ->
                mapOf(
                    "nodeId" to record.getValue(DRAFT.NODE_ID),
                    "spaceId" to record.getValue(NODE.SPACE_ID),
                    "title" to record.getValue(NODE.TITLE),
                    "spaceName" to record.getValue("space_name") as String?,
                    "updatedAt" to record.getValue(DRAFT.UPDATED_AT)
                )
            }
}
