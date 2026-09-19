package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_MEMBER as MEMBER
import tech.eflink.wiki.database.Tables.WIKI_SPACE as SPACE
import tech.eflink.wiki.database.Tables.USER
import tech.eflink.wiki.database.tables.records.WikiSpaceRecord

/** 空间列表行：空间记录 + 冗余展示信息 */
data class SpaceListRow(
    val space: WikiSpaceRecord,
    val ownerName: String?,
    val memberCount: Long,
    val myRole: Int?
)

/** 知识库空间数据访问 */
@Repository
class SpaceRepository(
    private val dsl: DSLContext,
    private val userGroupRepository: UserGroupRepository
) {

    fun create(name: String, icon: String?, description: String?, ownerId: Long, visibility: Int): Long =
        dsl.insertInto(SPACE)
            .set(SPACE.NAME, name)
            .set(SPACE.ICON, icon)
            .set(SPACE.DESCRIPTION, description)
            .set(SPACE.OWNER_ID, ownerId)
            .set(SPACE.VISIBILITY, visibility)
            .returningResult(SPACE.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WikiSpaceRecord? =
        dsl.selectFrom(SPACE).where(SPACE.ID.eq(id)).and(SPACE.IS_DEL.eq(0)).fetchOne()

    fun update(
        id: Long,
        name: String? = null,
        icon: String? = null,
        description: String? = null,
        visibility: Int? = null
    ) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        if (name != null) assignments[SPACE.NAME] = name
        if (icon != null) assignments[SPACE.ICON] = icon
        if (description != null) assignments[SPACE.DESCRIPTION] = description
        if (visibility != null) assignments[SPACE.VISIBILITY] = visibility
        if (assignments.isEmpty()) return
        dsl.update(SPACE).set(assignments).where(SPACE.ID.eq(id)).execute()
    }

    fun softDelete(id: Long) {
        dsl.update(SPACE).set(SPACE.IS_DEL, 1).where(SPACE.ID.eq(id)).execute()
    }

    /**
     * 我可见的空间列表：系统管理员看全部；否则 = 全站可见或我是所有者/成员/我所在的组被授权。
     * 附带我的空间角色（个人与组授权取最高）、成员数、所有者姓名。
     */
    fun listVisible(userId: Long, systemAdmin: Boolean): List<SpaceListRow> {
        val access = if (systemAdmin) {
            DSL.trueCondition()
        } else {
            SPACE.VISIBILITY.eq(1)
                .or(SPACE.OWNER_ID.eq(userId))
                .or(DSL.exists(
                    DSL.selectOne().from(MEMBER)
                        .where(MEMBER.SPACE_ID.eq(SPACE.ID)).and(MEMBER.USER_ID.eq(userId))
                ))
                .or(userGroupRepository.visibleViaGroupCondition(userId, SPACE.ID))
        }
        val spaces = dsl.selectFrom(SPACE)
            .where(SPACE.IS_DEL.eq(0)).and(access)
            .orderBy(SPACE.UPDATED_AT.desc())
            .fetch()
        if (spaces.isEmpty()) return emptyList()

        val spaceIds = spaces.map { it.id }
        val owners = dsl.selectFrom(USER).where(USER.ID.`in`(spaces.map { it.ownerId }.distinct()))
            .fetch().associate { it.id to it.displayName }
        val memberCounts = dsl.select(MEMBER.SPACE_ID, DSL.count())
            .from(MEMBER).where(MEMBER.SPACE_ID.`in`(spaceIds)).groupBy(MEMBER.SPACE_ID)
            .fetch().associate { it.value1() to it.value2().toLong() }
        val myRoles = dsl.selectFrom(MEMBER)
            .where(MEMBER.USER_ID.eq(userId)).and(MEMBER.SPACE_ID.`in`(spaceIds))
            .fetch().associate { it.spaceId to it.role }
        val groupRoles = userGroupRepository.minRolesViaGroups(userId, spaceIds)

        // 个人角色与组授权角色取最高（数值最小）；空值安全：两者都缺时视为无角色
        fun effectiveRole(spaceId: Long): Int? {
            val direct = myRoles[spaceId]
            val viaGroup = groupRoles[spaceId]
            return listOfNotNull(direct, viaGroup).minOrNull()
        }

        return spaces.map {
            SpaceListRow(
                space = it,
                ownerName = owners[it.ownerId],
                memberCount = memberCounts[it.id] ?: 0,
                myRole = if (it.ownerId == userId) 1 else effectiveRole(it.id)
            )
        }
    }
}
