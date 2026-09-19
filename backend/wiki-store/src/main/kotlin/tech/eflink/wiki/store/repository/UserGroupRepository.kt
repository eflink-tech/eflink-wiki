package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.Tables.USER_GROUP as GRP
import tech.eflink.wiki.database.Tables.USER_GROUP_MEMBER as GRP_MEMBER
import tech.eflink.wiki.database.Tables.WIKI_SPACE_GROUP as SPACE_GROUP
import tech.eflink.wiki.database.tables.records.UserGroupMemberRecord
import tech.eflink.wiki.database.tables.records.UserGroupRecord
import tech.eflink.wiki.database.tables.records.WikiSpaceGroupRecord

/** 组列表行：组记录 + 冗余成员数/被授权空间数 */
data class UserGroupListRow(
    val group: UserGroupRecord,
    val memberCount: Long,
    val spaceCount: Long = 0
)

/** 空间组授权行：授权记录 + 组冗余展示信息 */
data class SpaceGroupRow(
    val grant: WikiSpaceGroupRecord,
    val groupName: String,
    val groupSource: Int,
    val memberCount: Long = 0
)

/** 用户组数据访问：组 CRUD / 组成员 / 空间组授权 / 角色解析辅助 */
@Repository
class UserGroupRepository(private val dsl: DSLContext) {

    // ---------- 组 CRUD（管理后台） ----------

    fun page(keyword: String?, offset: Int, limit: Int): List<UserGroupListRow> {
        val groups = dsl.selectFrom(GRP)
            .where(notDeleted().and(keywordCondition(keyword)))
            .orderBy(GRP.ID.desc())
            .limit(offset, limit)
            .fetch()
        if (groups.isEmpty()) return emptyList()
        val counts = memberCounts(groups.map { it.id })
        val spaceCounts = spaceGrantCounts(groups.map { it.id })
        return groups.map { UserGroupListRow(it, counts[it.id] ?: 0, spaceCounts[it.id] ?: 0) }
    }

    fun countByKeyword(keyword: String?): Long =
        dsl.fetchCount(dsl.selectOne().from(GRP).where(notDeleted().and(keywordCondition(keyword)))).toLong()

    fun findById(id: Long): UserGroupRecord? =
        dsl.selectFrom(GRP).where(GRP.ID.eq(id)).and(notDeleted()).fetchOne()

    fun findByName(name: String): UserGroupRecord? =
        dsl.selectFrom(GRP).where(GRP.NAME.eq(name)).and(notDeleted()).fetchOne()

    fun findByExternalDn(externalDn: String): UserGroupRecord? =
        dsl.selectFrom(GRP).where(GRP.EXTERNAL_DN.eq(externalDn)).and(notDeleted()).fetchOne()

    fun create(name: String, description: String?, source: Int, externalDn: String? = null): Long =
        dsl.insertInto(GRP)
            .set(GRP.NAME, name)
            .set(GRP.DESCRIPTION, description)
            .set(GRP.SOURCE, source)
            .set(GRP.EXTERNAL_DN, externalDn)
            .returningResult(GRP.ID)
            .fetchOne()!!.value1()

    fun update(id: Long, name: String? = null, description: String? = null) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        if (name != null) assignments[GRP.NAME] = name
        if (description != null) assignments[GRP.DESCRIPTION] = description
        if (assignments.isEmpty()) return
        dsl.update(GRP).set(assignments).where(GRP.ID.eq(id)).execute()
    }

    /** 软删组并清理组成员关系与空间授权（纯关系行硬删） */
    fun softDelete(id: Long) {
        dsl.update(GRP).set(GRP.IS_DEL, 1).where(GRP.ID.eq(id)).execute()
        dsl.deleteFrom(GRP_MEMBER).where(GRP_MEMBER.GROUP_ID.eq(id)).execute()
        dsl.deleteFrom(SPACE_GROUP).where(SPACE_GROUP.GROUP_ID.eq(id)).execute()
    }

    fun countMembers(groupId: Long): Long =
        dsl.fetchCount(dsl.selectOne().from(GRP_MEMBER).where(GRP_MEMBER.GROUP_ID.eq(groupId))).toLong()

    private fun notDeleted() = GRP.IS_DEL.eq(0)

    private fun keywordCondition(keyword: String?) =
        if (keyword.isNullOrBlank()) DSL.trueCondition()
        else GRP.NAME.contains(keyword).or(GRP.DESCRIPTION.contains(keyword))

    private fun memberCounts(groupIds: List<Long>): Map<Long, Long> =
        dsl.select(GRP_MEMBER.GROUP_ID, DSL.count())
            .from(GRP_MEMBER)
            .where(GRP_MEMBER.GROUP_ID.`in`(groupIds))
            .groupBy(GRP_MEMBER.GROUP_ID)
            .fetch().associate { it.value1() to it.value2().toLong() }

    private fun spaceGrantCounts(groupIds: List<Long>): Map<Long, Long> =
        dsl.select(SPACE_GROUP.GROUP_ID, DSL.count())
            .from(SPACE_GROUP)
            .where(SPACE_GROUP.GROUP_ID.`in`(groupIds))
            .groupBy(SPACE_GROUP.GROUP_ID)
            .fetch().associate { it.value1() to it.value2().toLong() }

    // ---------- 组成员 ----------

    /** 成员列表（附用户展示信息），同 MemberRepository.listBySpace 的返回形态 */
    fun listMembers(groupId: Long): List<Map<String, Any?>> =
        dsl.select(GRP_MEMBER.ID, GRP_MEMBER.USER_ID, GRP_MEMBER.CREATED_AT, USER.USERNAME, USER.DISPLAY_NAME, USER.AVATAR)
            .from(GRP_MEMBER)
            .join(USER).on(USER.ID.eq(GRP_MEMBER.USER_ID))
            .where(GRP_MEMBER.GROUP_ID.eq(groupId))
            .orderBy(GRP_MEMBER.ID.asc())
            .fetch { record ->
                mapOf(
                    "id" to record.getValue(GRP_MEMBER.ID),
                    "userId" to record.getValue(GRP_MEMBER.USER_ID),
                    "createdAt" to record.getValue(GRP_MEMBER.CREATED_AT),
                    "username" to record.getValue(USER.USERNAME),
                    "displayName" to record.getValue(USER.DISPLAY_NAME),
                    "avatar" to record.getValue(USER.AVATAR)
                )
            }

    fun findMember(groupId: Long, userId: Long): UserGroupMemberRecord? =
        dsl.selectFrom(GRP_MEMBER)
            .where(GRP_MEMBER.GROUP_ID.eq(groupId)).and(GRP_MEMBER.USER_ID.eq(userId))
            .fetchOne()

    fun addMember(groupId: Long, userId: Long): Long =
        dsl.insertInto(GRP_MEMBER)
            .set(GRP_MEMBER.GROUP_ID, groupId)
            .set(GRP_MEMBER.USER_ID, userId)
            .returningResult(GRP_MEMBER.ID)
            .fetchOne()!!.value1()

    /** 按关系行 ID 移除成员（带 groupId 约束防误删） */
    fun removeMember(groupId: Long, memberId: Long) {
        dsl.deleteFrom(GRP_MEMBER)
            .where(GRP_MEMBER.ID.eq(memberId)).and(GRP_MEMBER.GROUP_ID.eq(groupId))
            .execute()
    }

    /**
     * LDAP 逐人同步：把用户在「同步组(source=2)」中的成员关系对齐到 targetGroupIds。
     * 手动组(source=1)不受影响；本次登录目录里已不在的同步组关系被移除。
     */
    fun syncMembership(userId: Long, targetGroupIds: List<Long>) {
        val current = dsl.select(GRP_MEMBER.GROUP_ID)
            .from(GRP_MEMBER)
            .join(GRP).on(GRP.ID.eq(GRP_MEMBER.GROUP_ID))
            .where(GRP_MEMBER.USER_ID.eq(userId)).and(GRP.SOURCE.eq(2)).and(GRP.IS_DEL.eq(0))
            .fetch(GRP_MEMBER.GROUP_ID)
        val target = targetGroupIds.toSet()
        current.filterNot { it in target }.forEach { removeUserFromGroup(userId, it) }
        target.filterNot { it in current }.forEach { addMember(it, userId) }
    }

    private fun removeUserFromGroup(userId: Long, groupId: Long) {
        dsl.deleteFrom(GRP_MEMBER)
            .where(GRP_MEMBER.GROUP_ID.eq(groupId)).and(GRP_MEMBER.USER_ID.eq(userId))
            .execute()
    }

    // ---------- 空间-组授权 ----------

    fun listBySpace(spaceId: Long): List<SpaceGroupRow> {
        val rows = dsl.select()
            .from(SPACE_GROUP)
            .join(GRP).on(GRP.ID.eq(SPACE_GROUP.GROUP_ID))
            .where(SPACE_GROUP.SPACE_ID.eq(spaceId)).and(GRP.IS_DEL.eq(0))
            .orderBy(SPACE_GROUP.ID.asc())
            .fetch { r ->
                SpaceGroupRow(
                    r.into(SPACE_GROUP),
                    r.getValue(GRP.NAME),
                    r.getValue(GRP.SOURCE)
                )
            }
        if (rows.isEmpty()) return rows
        val counts = memberCounts(rows.map { it.grant.groupId })
        return rows.map { it.copy(memberCount = counts[it.grant.groupId] ?: 0) }
    }

    fun findBySpaceAndGroup(spaceId: Long, groupId: Long): WikiSpaceGroupRecord? =
        dsl.selectFrom(SPACE_GROUP)
            .where(SPACE_GROUP.SPACE_ID.eq(spaceId)).and(SPACE_GROUP.GROUP_ID.eq(groupId))
            .fetchOne()

    fun findGrantById(grantId: Long): WikiSpaceGroupRecord? =
        dsl.selectFrom(SPACE_GROUP).where(SPACE_GROUP.ID.eq(grantId)).fetchOne()

    fun grant(spaceId: Long, groupId: Long, role: Int): Long =
        dsl.insertInto(SPACE_GROUP)
            .set(SPACE_GROUP.SPACE_ID, spaceId)
            .set(SPACE_GROUP.GROUP_ID, groupId)
            .set(SPACE_GROUP.ROLE, role)
            .returningResult(SPACE_GROUP.ID)
            .fetchOne()!!.value1()

    fun updateGrantRole(grantId: Long, role: Int) {
        dsl.update(SPACE_GROUP).set(SPACE_GROUP.ROLE, role).where(SPACE_GROUP.ID.eq(grantId)).execute()
    }

    fun revoke(grantId: Long) {
        dsl.deleteFrom(SPACE_GROUP).where(SPACE_GROUP.ID.eq(grantId)).execute()
    }

    // ---------- 角色解析辅助（WikiGuard / SpaceRepository 用） ----------

    /** 用户在某空间经组授权获得的最高（数值最小）角色；无组授权返回 null */
    fun minRoleViaGroups(spaceId: Long, userId: Long): Int? =
        dsl.select(DSL.min(SPACE_GROUP.ROLE))
            .from(SPACE_GROUP)
            .join(GRP_MEMBER).on(GRP_MEMBER.GROUP_ID.eq(SPACE_GROUP.GROUP_ID))
            .where(SPACE_GROUP.SPACE_ID.eq(spaceId)).and(GRP_MEMBER.USER_ID.eq(userId))
            .fetchOne { it.value1() }

    /** 用户在多个空间经组授权获得的最高角色（空间 ID → 角色），不含无组授权的空间 */
    fun minRolesViaGroups(userId: Long, spaceIds: Collection<Long>): Map<Long, Int> {
        if (spaceIds.isEmpty()) return emptyMap()
        return dsl.select(SPACE_GROUP.SPACE_ID, DSL.min(SPACE_GROUP.ROLE))
            .from(SPACE_GROUP)
            .join(GRP_MEMBER).on(GRP_MEMBER.GROUP_ID.eq(SPACE_GROUP.GROUP_ID))
            .where(GRP_MEMBER.USER_ID.eq(userId)).and(SPACE_GROUP.SPACE_ID.`in`(spaceIds))
            .groupBy(SPACE_GROUP.SPACE_ID)
            .fetch().associate { it.value1() to it.value2() }
    }

    /** 组授权可见性条件：用户所在组被授权的空间（供 SpaceRepository.listVisible 相关查询使用） */
    fun visibleViaGroupCondition(userId: Long, spaceIdField: Field<Long>): org.jooq.Condition =
        DSL.exists(
            DSL.selectOne()
                .from(SPACE_GROUP)
                .join(GRP).on(GRP.ID.eq(SPACE_GROUP.GROUP_ID).and(GRP.IS_DEL.eq(0)))
                .join(GRP_MEMBER).on(GRP_MEMBER.GROUP_ID.eq(GRP.ID).and(GRP_MEMBER.USER_ID.eq(userId)))
                .where(SPACE_GROUP.SPACE_ID.eq(spaceIdField))
        )
}
