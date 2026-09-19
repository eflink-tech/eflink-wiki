package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_MEMBER as MEMBER
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.tables.records.WikiMemberRecord

/** 空间成员数据访问 */
@Repository
class MemberRepository(private val dsl: DSLContext) {

    fun findBySpaceAndUser(spaceId: Long, userId: Long): WikiMemberRecord? =
        dsl.selectFrom(MEMBER)
            .where(MEMBER.SPACE_ID.eq(spaceId)).and(MEMBER.USER_ID.eq(userId))
            .fetchOne()

    fun findById(memberId: Long): WikiMemberRecord? =
        dsl.selectFrom(MEMBER).where(MEMBER.ID.eq(memberId)).fetchOne()

    /** 成员列表（附用户信息），空间管理员排前，按加入时间正序 */
    fun listBySpace(spaceId: Long): List<Map<String, Any?>> =
        dsl.select(MEMBER.ID, MEMBER.USER_ID, MEMBER.ROLE, MEMBER.CREATED_AT, USER.USERNAME, USER.DISPLAY_NAME, USER.AVATAR)
            .from(MEMBER)
            .join(USER).on(USER.ID.eq(MEMBER.USER_ID))
            .where(MEMBER.SPACE_ID.eq(spaceId))
            .orderBy(MEMBER.ROLE.asc(), MEMBER.ID.asc())
            .fetch { record ->
                mapOf(
                    "id" to record.getValue(MEMBER.ID),
                    "userId" to record.getValue(MEMBER.USER_ID),
                    "role" to record.getValue(MEMBER.ROLE),
                    "username" to record.getValue(USER.USERNAME),
                    "displayName" to record.getValue(USER.DISPLAY_NAME),
                    "avatar" to record.getValue(USER.AVATAR)
                )
            }

    fun add(spaceId: Long, userId: Long, role: Int): Long =
        dsl.insertInto(MEMBER)
            .set(MEMBER.SPACE_ID, spaceId)
            .set(MEMBER.USER_ID, userId)
            .set(MEMBER.ROLE, role)
            .returningResult(MEMBER.ID)
            .fetchOne()!!.value1()

    fun updateRole(memberId: Long, role: Int) {
        dsl.update(MEMBER).set(MEMBER.ROLE, role).where(MEMBER.ID.eq(memberId)).execute()
    }

    fun delete(memberId: Long) {
        dsl.deleteFrom(MEMBER).where(MEMBER.ID.eq(memberId)).execute()
    }

    fun countBySpace(spaceId: Long): Long =
        dsl.fetchCount(dsl.selectOne().from(MEMBER).where(MEMBER.SPACE_ID.eq(spaceId))).toLong()
}
