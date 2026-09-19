package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.tables.records.UserRecord

/** 用户表数据访问 */
@Repository
class UserRepository(private val dsl: DSLContext) {

    fun findById(id: Long): UserRecord? =
        dsl.selectFrom(USER).where(USER.ID.eq(id)).fetchOne()

    fun findByUsername(username: String): UserRecord? =
        dsl.selectFrom(USER).where(USER.USERNAME.eq(username)).fetchOne()

    /** 企业账号联合档案定位 */
    fun findByProviderAndExternalId(provider: String, externalId: String): UserRecord? =
        dsl.selectFrom(USER)
            .where(USER.PROVIDER.eq(provider)).and(USER.EXTERNAL_ID.eq(externalId))
            .fetchOne()

    fun countAll(): Long = dsl.fetchCount(USER).toLong()

    fun create(username: String, passwordHash: String, displayName: String, role: Int): Long =
        dsl.insertInto(USER)
            .set(USER.USERNAME, username)
            .set(USER.PASSWORD_HASH, passwordHash)
            .set(USER.DISPLAY_NAME, displayName)
            .set(USER.ROLE, role)
            .returningResult(USER.ID)
            .fetchOne()!!.value1()

    /** 选择性更新（null 不更新） */
    fun update(
        id: Long,
        displayName: String? = null,
        avatar: String? = null,
        passwordHash: String? = null,
        role: Int? = null,
        status: Int? = null
    ) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        displayName?.let { assignments[USER.DISPLAY_NAME] = it }
        avatar?.let { assignments[USER.AVATAR] = it }
        passwordHash?.let { assignments[USER.PASSWORD_HASH] = it }
        role?.let { assignments[USER.ROLE] = it }
        status?.let { assignments[USER.STATUS] = it }
        if (assignments.isEmpty()) return
        dsl.update(USER).set(assignments).where(USER.ID.eq(id)).execute()
    }

    /** 关键字（用户名/姓名）模糊分页 */
    fun page(keyword: String?, offset: Int, limit: Int): List<UserRecord> {
        val cond = if (keyword.isNullOrBlank()) {
            DSL.trueCondition()
        } else {
            USER.USERNAME.contains(keyword).or(USER.DISPLAY_NAME.contains(keyword))
        }
        return dsl.selectFrom(USER)
            .where(cond)
            .orderBy(USER.ID.desc())
            .limit(offset, limit)
            .fetch()
    }

    fun countByKeyword(keyword: String?): Long {
        val cond = if (keyword.isNullOrBlank()) {
            DSL.trueCondition()
        } else {
            USER.USERNAME.contains(keyword).or(USER.DISPLAY_NAME.contains(keyword))
        }
        return dsl.fetchCount(dsl.selectFrom(USER).where(cond)).toLong()
    }

    fun countAdmins(): Long = dsl.fetchCount(dsl.selectFrom(USER).where(USER.ROLE.eq(1))).toLong()
}
