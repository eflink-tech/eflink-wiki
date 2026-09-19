package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.OPERATION_LOG as OPLOG

/** 操作审计日志数据访问 */
@Repository
class OperationLogRepository(private val dsl: DSLContext) {

    fun insert(
        userId: Long,
        username: String,
        action: String,
        targetType: String?,
        targetId: String?,
        detail: String?,
        ip: String?
    ) {
        dsl.insertInto(OPLOG)
            .set(OPLOG.USER_ID, userId)
            .set(OPLOG.USERNAME, username)
            .set(OPLOG.ACTION, action)
            .set(OPLOG.TARGET_TYPE, targetType)
            .set(OPLOG.TARGET_ID, targetId)
            .set(OPLOG.DETAIL, detail?.take(1024))
            .set(OPLOG.IP, ip)
            .execute()
    }

    /** 审计查询（可按动作/操作人过滤），新记录在前 */
    fun page(action: String?, userId: Long?, offset: Int, limit: Int): List<Map<String, Any?>> {
        val cond = DSL.trueCondition()
        action?.takeIf { it.isNotBlank() }?.let { cond.and(OPLOG.ACTION.eq(it)) }
        userId?.let { cond.and(OPLOG.USER_ID.eq(it)) }
        return dsl.selectFrom(OPLOG)
            .where(cond)
            .orderBy(OPLOG.ID.desc())
            .limit(offset, limit)
            .fetch { record ->
                mapOf(
                    "record" to record,
                )
            }
    }

    fun count(action: String?, userId: Long?): Long {
        val cond = DSL.trueCondition()
        action?.takeIf { it.isNotBlank() }?.let { cond.and(OPLOG.ACTION.eq(it)) }
        userId?.let { cond.and(OPLOG.USER_ID.eq(it)) }
        return dsl.fetchCount(dsl.selectFrom(OPLOG).where(cond)).toLong()
    }
}
