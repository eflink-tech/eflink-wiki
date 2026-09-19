package tech.eflink.wiki.app.impl

import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.contract.wiki.MemberResult
import tech.eflink.wiki.contract.wiki.NodeResult
import tech.eflink.wiki.contract.wiki.SpaceResult
import tech.eflink.wiki.store.repository.SpaceListRow
import tech.eflink.wiki.database.tables.records.UserRecord
import tech.eflink.wiki.database.tables.records.WikiNodeRecord
import tech.eflink.wiki.database.tables.records.WikiSpaceRecord
import java.time.LocalDateTime
import java.time.ZoneId

/** 领域记录 → 契约 DTO 的映射工具 */
object DtoMappers {

    /** LocalDateTime → epoch 毫秒（前端统一用毫秒时间戳） */
    fun epoch(dt: LocalDateTime?): Long? =
        dt?.atZone(ZoneId.systemDefault())?.toInstant()?.toEpochMilli()

    fun toUserResult(r: UserRecord): UserResult = UserResult().apply {
        id = r.id
        username = r.username
        displayName = r.displayName
        avatar = r.avatar
        role = r.role
        status = r.status
        createdAt = epoch(r.createdAt)
    }

    fun toSpaceResult(
        r: WikiSpaceRecord,
        ownerName: String? = null,
        memberCount: Long = 0,
        myRole: Int? = null
    ): SpaceResult = SpaceResult().apply {
        id = r.id
        name = r.name
        icon = r.icon
        description = r.description
        visibility = r.visibility
        ownerId = r.ownerId
        this.ownerName = ownerName
        this.memberCount = memberCount
        this.myRole = myRole ?: 0
        createdAt = epoch(r.createdAt)
        updatedAt = epoch(r.updatedAt)
    }

    fun toSpaceResult(row: SpaceListRow): SpaceResult =
        toSpaceResult(row.space, row.ownerName, row.memberCount, row.myRole)

    fun toNodeResult(r: WikiNodeRecord): NodeResult = NodeResult().apply {
        id = r.id
        spaceId = r.spaceId
        parentId = r.parentId
        title = r.title
        sort = r.sortOrder
        updatedAt = epoch(r.updatedAt)
    }

    @Suppress("UNCHECKED_CAST")
    fun toMemberResult(m: Map<String, Any?>): MemberResult = MemberResult().apply {
        id = m["id"] as Long
        userId = m["userId"] as Long
        username = m["username"] as String
        displayName = m["displayName"] as String
        avatar = m["avatar"] as String?
        role = m["role"] as Int
    }
}
