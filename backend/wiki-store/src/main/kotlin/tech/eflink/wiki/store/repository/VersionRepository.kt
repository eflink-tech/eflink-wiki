package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.Tables.WIKI_SPACE as SPACE
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.Tables.WIKI_VERSION as VERSION
import tech.eflink.wiki.database.tables.records.WikiVersionRecord

/** 页面发布版本数据访问（不可变快照） */
@Repository
class VersionRepository(private val dsl: DSLContext) {

    fun create(nodeId: Long, versionNo: Int, title: String, content: String?, publishedBy: Long): Long =
        dsl.insertInto(VERSION)
            .set(VERSION.NODE_ID, nodeId)
            .set(VERSION.VERSION_NO, versionNo)
            .set(VERSION.TITLE, title)
            .set(VERSION.CONTENT, content)
            .set(VERSION.PUBLISHED_BY, publishedBy)
            .returningResult(VERSION.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WikiVersionRecord? =
        dsl.selectFrom(VERSION).where(VERSION.ID.eq(id)).fetchOne()

    fun findByNodeAndNo(nodeId: Long, versionNo: Int): WikiVersionRecord? =
        dsl.selectFrom(VERSION)
            .where(VERSION.NODE_ID.eq(nodeId)).and(VERSION.VERSION_NO.eq(versionNo))
            .fetchOne()

    /** 节点内下一个版本号 */
    fun nextVersionNo(nodeId: Long): Int =
        dsl.select(DSL.max(VERSION.VERSION_NO)).from(VERSION)
            .where(VERSION.NODE_ID.eq(nodeId))
            .fetchOne()?.value1()?.plus(1) ?: 1

    /** 版本列表（附发布人姓名），新版本在前 */
    fun listByNode(nodeId: Long): List<Map<String, Any?>> =
        dsl.select(
            VERSION.VERSION_NO, VERSION.TITLE, VERSION.PUBLISHED_AT,
            USER.DISPLAY_NAME.`as`("publisher_name")
        )
            .from(VERSION)
            .leftJoin(USER).on(USER.ID.eq(VERSION.PUBLISHED_BY))
            .where(VERSION.NODE_ID.eq(nodeId))
            .orderBy(VERSION.VERSION_NO.desc())
            .fetch { record ->
                mapOf(
                    "versionNo" to record.getValue(VERSION.VERSION_NO),
                    "title" to record.getValue(VERSION.TITLE),
                    "publishedAt" to record.getValue(VERSION.PUBLISHED_AT),
                    "publisherName" to record.getValue("publisher_name") as String?
                )
            }

    fun deleteByNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        dsl.deleteFrom(VERSION).where(VERSION.NODE_ID.`in`(nodeIds)).execute()
    }

    /**
     * 全文检索已发布版本（MySQL ngram），返回匹配且页面/空间未删除的节点 ID 去重列表。
     * 权限过滤（空间可见性）由调用方完成。
     */
    fun searchNodeIds(keyword: String, limit: Int): List<Long> {
        if (keyword.isBlank()) return emptyList()
        val matchCondition = DSL.condition(
            "MATCH({0}, {1}) AGAINST({2} IN NATURAL LANGUAGE MODE)",
            VERSION.TITLE, VERSION.CONTENT, DSL.value(keyword)
        )
        return dsl.selectDistinct(VERSION.NODE_ID)
            .from(VERSION)
            .join(NODE).on(NODE.ID.eq(VERSION.NODE_ID)).and(NODE.IS_DEL.eq(0))
            .join(SPACE).on(SPACE.ID.eq(NODE.SPACE_ID)).and(SPACE.IS_DEL.eq(0))
            .where(matchCondition)
            .limit(limit)
            .fetch(VERSION.NODE_ID)
    }
}
