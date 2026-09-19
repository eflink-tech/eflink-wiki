package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_NODE as NODE
import tech.eflink.wiki.database.tables.records.WikiNodeRecord
import java.time.LocalDateTime

/** 页面树节点数据访问 */
@Repository
class NodeRepository(private val dsl: DSLContext) {

    fun create(spaceId: Long, parentId: Long, title: String, sortOrder: Int, createdBy: Long): Long =
        dsl.insertInto(NODE)
            .set(NODE.SPACE_ID, spaceId)
            .set(NODE.PARENT_ID, parentId)
            .set(NODE.TITLE, title)
            .set(NODE.SORT_ORDER, sortOrder)
            .set(NODE.CREATED_BY, createdBy)
            .returningResult(NODE.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WikiNodeRecord? =
        dsl.selectFrom(NODE).where(NODE.ID.eq(id)).and(NODE.IS_DEL.eq(0)).fetchOne()

    /** 含已删除（回收站/子树操作用） */
    fun findByIdIncludeDeleted(id: Long): WikiNodeRecord? =
        dsl.selectFrom(NODE).where(NODE.ID.eq(id)).fetchOne()

    /** 选择性更新（null 不更新）；移动到回收站请用 softDelete */
    fun update(id: Long, title: String? = null, parentId: Long? = null, sort: Int? = null) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        title?.let { assignments[NODE.TITLE] = it }
        parentId?.let { assignments[NODE.PARENT_ID] = it }
        sort?.let { assignments[NODE.SORT_ORDER] = it }
        if (assignments.isEmpty()) return
        dsl.update(NODE).set(assignments).where(NODE.ID.eq(id)).execute()
    }

    /** 同级最大排序值 */
    fun maxSort(spaceId: Long, parentId: Long): Int =
        dsl.select(DSL.max(NODE.SORT_ORDER)).from(NODE)
            .where(NODE.SPACE_ID.eq(spaceId)).and(NODE.PARENT_ID.eq(parentId)).and(NODE.IS_DEL.eq(0))
            .fetchOne()?.value1() ?: 0

    /** 空间内全部未删除节点（树组装用） */
    fun listBySpace(spaceId: Long): List<WikiNodeRecord> =
        dsl.selectFrom(NODE)
            .where(NODE.SPACE_ID.eq(spaceId)).and(NODE.IS_DEL.eq(0))
            .orderBy(NODE.SORT_ORDER.asc(), NODE.ID.asc())
            .fetch()

    /** 空间内全部节点（含已删除，子树/回收站操作用） */
    fun listBySpaceIncludeDeleted(spaceId: Long): List<WikiNodeRecord> =
        dsl.selectFrom(NODE).where(NODE.SPACE_ID.eq(spaceId)).fetch()

    /** 空间内全部已删除节点（回收站列表） */
    fun listTrash(spaceId: Long): List<WikiNodeRecord> =
        dsl.selectFrom(NODE)
            .where(NODE.SPACE_ID.eq(spaceId)).and(NODE.IS_DEL.eq(1))
            .orderBy(NODE.DELETED_AT.desc())
            .fetch()

    fun softDelete(ids: List<Long>) {
        if (ids.isEmpty()) return
        dsl.update(NODE)
            .set(NODE.IS_DEL, 1)
            .set(NODE.DELETED_AT, LocalDateTime.now())
            .where(NODE.ID.`in`(ids))
            .execute()
    }

    fun restore(ids: List<Long>) {
        if (ids.isEmpty()) return
        dsl.update(NODE)
            .set(NODE.IS_DEL, 0)
            .setNull(NODE.DELETED_AT)
            .where(NODE.ID.`in`(ids))
            .execute()
    }

    /** 发布后指向当前版本 */
    fun setCurrentVersion(id: Long, versionId: Long) {
        dsl.update(NODE).set(NODE.CURRENT_VERSION_ID, versionId).where(NODE.ID.eq(id)).execute()
    }

    fun updateParent(ids: List<Long>, parentId: Long) {
        if (ids.isEmpty()) return
        dsl.update(NODE).set(NODE.PARENT_ID, parentId).where(NODE.ID.`in`(ids)).execute()
    }

    /** 彻底删除节点及其全部关联数据（草稿/版本/收藏/活动） */
    fun purge(ids: List<Long>) {
        if (ids.isEmpty()) return
        dsl.deleteFrom(NODE).where(NODE.ID.`in`(ids)).execute()
    }

    /** 空间的页面总数（统计） */
    fun countBySpace(spaceId: Long): Long =
        dsl.fetchCount(dsl.selectOne().from(NODE).where(NODE.SPACE_ID.eq(spaceId)).and(NODE.IS_DEL.eq(0))).toLong()

    /** 新页面排在同级末尾的排序值 */
    fun nextSort(spaceId: Long, parentId: Long): Int = maxSort(spaceId, parentId) + 1
}
