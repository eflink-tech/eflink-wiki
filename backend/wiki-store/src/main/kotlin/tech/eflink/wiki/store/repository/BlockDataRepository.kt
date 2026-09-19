package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_BLOCK_DATA as BLOCK_DATA
import tech.eflink.wiki.database.tables.records.WikiBlockDataRecord
import java.time.LocalDateTime

/** 嵌入块数据（word/excel/pptx/draw/mindmap 五模块独立内容） */
@Repository
class BlockDataRepository(private val dsl: DSLContext) {

    fun findByNodeAndEmbed(nodeId: Long, embedId: String): WikiBlockDataRecord? =
        dsl.selectFrom(BLOCK_DATA)
            .where(BLOCK_DATA.NODE_ID.eq(nodeId)).and(BLOCK_DATA.EMBED_ID.eq(embedId))
            .fetchOne()

    /**
     * 是否存在 updatedAt 不早于 after 的嵌入块（用于判断「只改了嵌入块」的页面是否需要重新发布）。
     * 两边都是秒精度 DATETIME，用 >= 避免同秒写入被漏判。
     */
    fun existsUpdatedAfter(nodeId: Long, after: LocalDateTime): Boolean =
        dsl.fetchExists(
            dsl.selectOne().from(BLOCK_DATA)
                .where(BLOCK_DATA.NODE_ID.eq(nodeId)).and(BLOCK_DATA.UPDATED_AT.greaterOrEqual(after))
        )

    /** 有则更新，无则插入 */
    fun upsert(
        nodeId: Long,
        embedId: String,
        type: String,
        title: String,
        content: String?,
        updatedBy: Long?
    ) {
        val existing = findByNodeAndEmbed(nodeId, embedId)
        if (existing != null) {
            val step = dsl.update(BLOCK_DATA).set(BLOCK_DATA.CONTENT, content).set(BLOCK_DATA.UPDATED_BY, updatedBy)
            if (title.isNotBlank()) step.set(BLOCK_DATA.TITLE, title)
            step.where(BLOCK_DATA.ID.eq(existing.id)).execute()
        } else {
            dsl.insertInto(BLOCK_DATA)
                .set(BLOCK_DATA.NODE_ID, nodeId)
                .set(BLOCK_DATA.EMBED_ID, embedId)
                .set(BLOCK_DATA.TYPE, type)
                .set(BLOCK_DATA.TITLE, title)
                .set(BLOCK_DATA.CONTENT, content)
                .set(BLOCK_DATA.UPDATED_BY, updatedBy)
                .execute()
        }
    }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(BLOCK_DATA).where(BLOCK_DATA.NODE_ID.`in`(nodeIds)).execute()
    }
}
