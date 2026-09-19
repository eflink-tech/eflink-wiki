package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_DOC_STATE as DOC_STATE

/** 协同编辑 Yjs 快照数据访问（每页一行，覆盖写） */
@Repository
class DocStateRepository(private val dsl: DSLContext) {

    fun findState(nodeId: Long): ByteArray? =
        dsl.select(DOC_STATE.STATE)
            .from(DOC_STATE)
            .where(DOC_STATE.NODE_ID.eq(nodeId))
            .fetchOne(DOC_STATE.STATE)

    fun upsert(nodeId: Long, state: ByteArray) {
        dsl.insertInto(DOC_STATE)
            .set(DOC_STATE.NODE_ID, nodeId)
            .set(DOC_STATE.STATE, state)
            .onDuplicateKeyUpdate()
            .set(DOC_STATE.STATE, state)
            .execute()
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(DOC_STATE).where(DOC_STATE.NODE_ID.`in`(nodeIds)).execute()
    }
}
