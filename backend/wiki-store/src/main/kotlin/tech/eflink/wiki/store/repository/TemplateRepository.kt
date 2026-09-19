package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.Tables.WIKI_TEMPLATE as TEMPLATE
import tech.eflink.wiki.database.tables.records.WikiTemplateRecord

/** 页面模板数据访问 */
@Repository
class TemplateRepository(private val dsl: DSLContext) {

    fun create(title: String, description: String?, content: String?, createdBy: Long): Long =
        dsl.insertInto(TEMPLATE)
            .set(TEMPLATE.TITLE, title)
            .set(TEMPLATE.DESCRIPTION, description)
            .set(TEMPLATE.CONTENT, content)
            .set(TEMPLATE.CREATED_BY, createdBy)
            .returningResult(TEMPLATE.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WikiTemplateRecord? =
        dsl.selectFrom(TEMPLATE).where(TEMPLATE.ID.eq(id)).fetchOne()

    /** 模板列表（附创建人姓名），新模板在前 */
    fun listAll(): List<Map<String, Any?>> =
        dsl.select(
            TEMPLATE.ID, TEMPLATE.TITLE, TEMPLATE.DESCRIPTION, TEMPLATE.CREATED_AT,
            USER.DISPLAY_NAME.`as`("creator_name")
        )
            .from(TEMPLATE)
            .leftJoin(USER).on(USER.ID.eq(TEMPLATE.CREATED_BY))
            .orderBy(TEMPLATE.ID.desc())
            .fetch { record ->
                mapOf(
                    "record" to record.into(TEMPLATE),
                    "creatorName" to record.getValue("creator_name") as String?
                )
            }

    fun delete(id: Long) {
        dsl.deleteFrom(TEMPLATE).where(TEMPLATE.ID.eq(id)).execute()
    }
}
