package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.contract.wiki.AddMemberCommand
import tech.eflink.wiki.contract.wiki.AddMemberRequest
import tech.eflink.wiki.contract.wiki.CreateSpaceCommand
import tech.eflink.wiki.contract.wiki.DeleteSpaceCommand
import tech.eflink.wiki.contract.wiki.GetSpaceCommand
import tech.eflink.wiki.contract.wiki.GetSpaceTreeCommand
import tech.eflink.wiki.contract.wiki.ListMembersCommand
import tech.eflink.wiki.contract.wiki.ListSpacesCommand
import tech.eflink.wiki.contract.wiki.MemberListResult
import tech.eflink.wiki.contract.wiki.RemoveMemberCommand
import tech.eflink.wiki.contract.wiki.SpaceListResult
import tech.eflink.wiki.contract.wiki.SpaceResult
import tech.eflink.wiki.contract.wiki.SpaceUpsertRequest
import tech.eflink.wiki.contract.wiki.TreeNodeResult
import tech.eflink.wiki.contract.wiki.TreeResult
import tech.eflink.wiki.contract.wiki.UpdateMemberCommand
import tech.eflink.wiki.contract.wiki.UpdateSpaceCommand
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.database.tables.records.WikiNodeRecord
import tech.eflink.wiki.store.repository.MemberRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.UserRepository

/** 我的空间列表 */
@Service
class ListSpacesCommandHandler(
    private val spaceRepository: SpaceRepository
) : CommandHandlerBase<ListSpacesCommand, SpaceListResult>() {

    override fun handle(command: ListSpacesCommand, result: SpaceListResult) {
        val userId = tech.eflink.wiki.app.service.AuthContext.currentUserId()
        val systemAdmin = tech.eflink.wiki.app.service.AuthContext.isSystemAdmin()
        result.list = spaceRepository.listVisible(userId, systemAdmin)
            .map { DtoMappers.toSpaceResult(it) }
            .toMutableList()
    }
}

/** 创建空间：创建者自动成为空间管理员成员 */
@Service
class CreateSpaceCommandHandler(
    private val spaceRepository: SpaceRepository,
    private val memberRepository: MemberRepository
) : CommandHandlerBase<CreateSpaceCommand, SpaceResult>() {

    override fun validate(command: CreateSpaceCommand) {
        val request = command.request
        require(request.name.isNotBlank()) { "空间名称不能为空" }
        require(request.name.length <= 128) { "空间名称过长" }
        request.visibility?.let { require(it == 0 || it == 1) { "可见性取值不合法" } }
    }

    override fun handle(command: CreateSpaceCommand, result: SpaceResult) {
        val userId = tech.eflink.wiki.app.service.AuthContext.currentUserId()
        val request = command.request
        val id = spaceRepository.create(
            name = request.name.trim(),
            icon = request.icon?.trim()?.takeIf { it.isNotEmpty() },
            description = request.description?.trim()?.takeIf { it.isNotEmpty() },
            ownerId = userId,
            visibility = request.visibility ?: 0
        )
        memberRepository.add(id, userId, 1)
        DtoMappers.toSpaceResult(spaceRepository.findById(id)!!, memberCount = 1, myRole = 1).let {
            result.id = it.id; result.name = it.name; result.icon = it.icon
            result.description = it.description; result.visibility = it.visibility; result.ownerId = it.ownerId
            result.ownerName = it.ownerName; result.myRole = it.myRole; result.memberCount = it.memberCount
            result.createdAt = it.createdAt; result.updatedAt = it.updatedAt
        }
    }
}

/** 空间详情 */
@Service
class GetSpaceCommandHandler(
    private val spaceRepository: SpaceRepository,
    private val memberRepository: MemberRepository,
    private val userRepository: UserRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetSpaceCommand, SpaceResult>() {

    override fun handle(command: GetSpaceCommand, result: SpaceResult) {
        val access = guard.requireSpaceRole(command.id, 3)
        val ownerName = userRepository.findById(access.space.ownerId)?.displayName
        DtoMappers.toSpaceResult(
            access.space,
            ownerName = ownerName,
            memberCount = memberRepository.countBySpace(command.id),
            myRole = access.role
        ).let {
            result.id = it.id; result.name = it.name; result.icon = it.icon
            result.description = it.description; result.visibility = it.visibility; result.ownerId = it.ownerId
            result.ownerName = it.ownerName; result.myRole = it.myRole; result.memberCount = it.memberCount
            result.createdAt = it.createdAt; result.updatedAt = it.updatedAt
        }
    }
}

/** 更新空间（仅空间管理员） */
@Service
class UpdateSpaceCommandHandler(
    private val spaceRepository: SpaceRepository,
    private val memberRepository: MemberRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<UpdateSpaceCommand, SpaceResult>() {

    override fun validate(command: UpdateSpaceCommand) {
        command.request.name?.let { require(it.isNotBlank()) { "空间名称不能为空" } }
    }

    override fun handle(command: UpdateSpaceCommand, result: SpaceResult) {
        val access = guard.requireSpaceRole(command.id, 1)
        spaceRepository.update(
            id = command.id,
            name = command.request.name?.trim()?.takeIf { it.isNotEmpty() },
            icon = command.request.icon,
            description = command.request.description,
            visibility = command.request.visibility
        )
        DtoMappers.toSpaceResult(
            spaceRepository.findById(command.id)!!,
            memberCount = memberRepository.countBySpace(command.id),
            myRole = access.role
        ).let {
            result.id = it.id; result.name = it.name; result.icon = it.icon
            result.description = it.description; result.visibility = it.visibility; result.ownerId = it.ownerId
            result.ownerName = it.ownerName; result.myRole = it.myRole; result.memberCount = it.memberCount
            result.createdAt = it.createdAt; result.updatedAt = it.updatedAt
        }
    }
}

/** 删除空间（软删，仅空间管理员） */
@Service
class DeleteSpaceCommandHandler(
    private val spaceRepository: SpaceRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<DeleteSpaceCommand, EmptyResult>() {

    override fun handle(command: DeleteSpaceCommand, result: EmptyResult) {
        guard.requireSpaceRole(command.id, 1)
        spaceRepository.softDelete(command.id)
    }
}

/** 成员列表 */
@Service
class ListMembersCommandHandler(
    private val memberRepository: MemberRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ListMembersCommand, MemberListResult>() {

    override fun handle(command: ListMembersCommand, result: MemberListResult) {
        guard.requireSpaceRole(command.spaceId, 3)
        result.list = memberRepository.listBySpace(command.spaceId)
            .map { DtoMappers.toMemberResult(it) }
            .toMutableList()
    }
}

/** 添加成员（仅空间管理员） */
@Service
class AddMemberCommandHandler(
    private val memberRepository: MemberRepository,
    private val userRepository: UserRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<AddMemberCommand, tech.eflink.wiki.contract.wiki.MemberResult>() {

    override fun validate(command: AddMemberCommand) {
        require(command.request.role in 1..3) { "角色取值不合法" }
    }

    override fun handle(command: AddMemberCommand, result: tech.eflink.wiki.contract.wiki.MemberResult) {
        val space = guard.requireSpaceRole(command.spaceId, 1).space
        val user = userRepository.findById(command.request.userId) ?: throw ValidateException(406, "用户不存在")
        if (memberRepository.findBySpaceAndUser(command.spaceId, user.id) != null) {
            throw ValidateException(406, "该用户已是空间成员")
        }
        val memberId = memberRepository.add(command.spaceId, user.id, command.request.role)
        result.apply {
            id = memberId; userId = user.id; username = user.username
            displayName = user.displayName; avatar = user.avatar; role = command.request.role
        }
    }
}

/** 修改成员角色（仅空间管理员；空间所有者角色不可改） */
@Service
class UpdateMemberCommandHandler(
    private val memberRepository: MemberRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<UpdateMemberCommand, tech.eflink.wiki.contract.wiki.MemberResult>() {

    override fun validate(command: UpdateMemberCommand) {
        require(command.request.role in 1..3) { "角色取值不合法" }
    }

    override fun handle(command: UpdateMemberCommand, result: tech.eflink.wiki.contract.wiki.MemberResult) {
        val space = guard.requireSpaceRole(command.spaceId, 1).space
        val member = memberRepository.findById(command.memberId) ?: throw ValidateException(406, "成员不存在")
        if (member.spaceId != command.spaceId) throw ValidateException(406, "成员不属于该空间")
        if (member.userId == space.ownerId && command.request.role != 1) {
            throw ValidateException(406, "不能修改空间所有者的角色")
        }
        memberRepository.updateRole(command.memberId, command.request.role)
        DtoMappers.toMemberResult(memberRepository.listBySpace(command.spaceId).first { it["id"] == command.memberId })
            .let {
                result.id = it.id; result.userId = it.userId; result.username = it.username
                result.displayName = it.displayName; result.avatar = it.avatar; result.role = it.role
            }
    }
}

/** 移除成员（仅空间管理员；空间所有者不可移除） */
@Service
class RemoveMemberCommandHandler(
    private val memberRepository: MemberRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<RemoveMemberCommand, EmptyResult>() {

    override fun handle(command: RemoveMemberCommand, result: EmptyResult) {
        val space = guard.requireSpaceRole(command.spaceId, 1).space
        val member = memberRepository.findById(command.memberId) ?: throw ValidateException(406, "成员不存在")
        if (member.spaceId != command.spaceId) throw ValidateException(406, "成员不属于该空间")
        if (member.userId == space.ownerId) throw ValidateException(406, "不能移除空间所有者")
        memberRepository.delete(command.memberId)
    }
}

/** 页面树：单空间全量节点内存组树 */
@Service
class GetSpaceTreeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetSpaceTreeCommand, TreeResult>() {

    override fun handle(command: GetSpaceTreeCommand, result: TreeResult) {
        guard.requireSpaceRole(command.spaceId, 3)
        result.spaceId = command.spaceId
        val nodes = nodeRepository.listBySpace(command.spaceId)
        val byId = nodes.associateBy { it.id }
        val treeById = LinkedHashMap<Long, TreeNodeResult>()
        nodes.forEach { treeById[it.id] = toTreeNode(it) }
        nodes.forEach { node ->
            val treeNode = treeById.getValue(node.id)
            val parent = if (node.parentId == 0L) null else byId[node.parentId]
            if (node.parentId == 0L || parent == null) {
                result.nodes.add(treeNode)          // 根，或父节点缺失/已删除时挂到根
            } else {
                treeById.getValue(node.parentId).children.add(treeNode)
            }
        }
    }

    private fun toTreeNode(node: WikiNodeRecord): TreeNodeResult = TreeNodeResult().apply {
        id = node.id
        parentId = node.parentId
        title = node.title
        sort = node.sortOrder
        currentVersionId = node.currentVersionId
        updatedAt = DtoMappers.epoch(node.updatedAt)
    }
}
