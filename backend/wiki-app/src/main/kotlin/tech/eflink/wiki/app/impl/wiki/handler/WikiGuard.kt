package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.database.tables.records.WikiSpaceRecord
import tech.eflink.wiki.store.repository.MemberRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.UserGroupRepository

/** 空间访问校验：系统管理员与空间所有者视为空间管理员 */
@Service
class WikiGuard(
    private val spaceRepository: SpaceRepository,
    private val memberRepository: MemberRepository,
    private val userGroupRepository: UserGroupRepository
) {

    data class SpaceAccess(val space: WikiSpaceRecord, val role: Int, val userId: Long)

    /** 校验当前用户在空间内的角色是否达到 minimumRole（1 admin 2 editor 3 viewer），并返回空间与角色 */
    fun requireSpaceRole(spaceId: Long, minimumRole: Int): SpaceAccess {
        val userId = AuthContext.currentUserId()
        val space = spaceRepository.findById(spaceId) ?: throw IllegalArgumentException("空间不存在")
        val role = resolveRole(space, userId)
        if (role > minimumRole) throw IllegalArgumentException("没有操作权限")
        return SpaceAccess(space, role, userId)
    }

    /**
     * 解析用户在某空间的有效角色：系统管理员/所有者为 1；
     * 其余取「个人成员角色」与「组授权角色」中的最高（数值最小）；
     * 两者皆无时私有空间拒绝、登录可读空间视为查看者。
     */
    fun resolveRole(space: WikiSpaceRecord, userId: Long): Int {
        if (AuthContext.isSystemAdmin() || space.ownerId == userId) return 1
        val direct = memberRepository.findBySpaceAndUser(space.id, userId)?.role
        val viaGroup = userGroupRepository.minRoleViaGroups(space.id, userId)
        val effective = listOfNotNull(direct, viaGroup).minOrNull()
        return effective ?: if (space.visibility == 1) 3
        else throw TokenValidationException(406, "无权访问该空间")
    }

    /** 我可见的空间 id → 我的角色（搜索结果过滤用） */
    fun visibleSpaceRoles(): Map<Long, Int> =
        spaceRepository.listVisible(AuthContext.currentUserId(), AuthContext.isSystemAdmin())
            .associate { it.space.id to (it.myRole ?: 3) }
}
