package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.contract.wiki.CreateNodeCommand
import tech.eflink.wiki.contract.wiki.CreateNodeRequest
import tech.eflink.wiki.contract.wiki.DeleteNodeCommand
import tech.eflink.wiki.contract.wiki.ListTrashCommand
import tech.eflink.wiki.contract.wiki.NodeResult
import tech.eflink.wiki.contract.wiki.RestoreNodeCommand
import tech.eflink.wiki.contract.wiki.TrashListResult
import tech.eflink.wiki.contract.wiki.UpdateNodeCommand
import tech.eflink.wiki.contract.wiki.UpdateNodeRequest
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.database.tables.records.WikiNodeRecord
import tech.eflink.wiki.store.repository.ActivityRepository
import tech.eflink.wiki.store.repository.DraftRepository
import tech.eflink.wiki.store.repository.FavoriteRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.VersionRepository

/** 页面子树工具：后代收集与树结构判断 */
object NodeTreeSupport {

    /** 收集 rootId 的全部后代节点 id（不含自身），nodes 需为同一空间的节点集合 */
    fun descendantIds(nodes: List<WikiNodeRecord>, rootId: Long): List<Long> {
        val byParent = nodes.groupBy { it.parentId }
        val result = mutableListOf<Long>()
        val stack = ArrayDeque<Long>().apply { add(rootId) }
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            byParent[current]?.forEach { child ->
                result.add(child.id)
                stack.addLast(child.id)
            }
        }
        return result
    }

    /** rootId 自身 + 全部后代 */
    fun subtreeIds(nodes: List<WikiNodeRecord>, rootId: Long): List<Long> =
        descendantIds(nodes, rootId) + rootId
}

/** 创建页面（编辑者及以上），同级排在末尾；支持从模板建页（模板正文作为创建者草稿初始内容） */
@Service
class CreateNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val templateRepository: tech.eflink.wiki.store.repository.TemplateRepository,
    private val draftRepository: tech.eflink.wiki.store.repository.DraftRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<CreateNodeCommand, NodeResult>() {

    override fun validate(command: CreateNodeCommand) {
        require(command.request.spaceId > 0) { "缺少空间ID" }
        require(command.request.title.isNotBlank()) { "页面标题不能为空" }
    }

    override fun handle(command: CreateNodeCommand, result: NodeResult) {
        val request = command.request
        guard.requireSpaceRole(request.spaceId, 2)
        if (request.parentId > 0) {
            val parent = nodeRepository.findById(request.parentId) ?: throw ValidateException(406, "父页面不存在")
            if (parent.spaceId != request.spaceId) throw ValidateException(406, "父页面不属于该空间")
        }
        val id = nodeRepository.create(
            spaceId = request.spaceId,
            parentId = request.parentId,
            title = request.title.trim().take(256),
            sortOrder = nodeRepository.nextSort(request.spaceId, request.parentId),
            createdBy = AuthContext.currentUserId()
        )
        // 从模板建页：模板正文进创建者草稿
        val templateId = request.templateId
        if (templateId != null && templateId > 0) {
            templateRepository.findById(templateId)?.let { template ->
                draftRepository.upsert(id, AuthContext.currentUserId(), template.content ?: "", null)
            }
        }
        DtoMappers.toNodeResult(nodeRepository.findById(id)!!).let {
            result.id = it.id; result.spaceId = it.spaceId; result.parentId = it.parentId
            result.title = it.title; result.sort = it.sort; result.updatedAt = it.updatedAt
        }
    }
}

/** 更新页面：改名 / 移动 / 排序 */
@Service
class UpdateNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<UpdateNodeCommand, NodeResult>() {

    override fun handle(command: UpdateNodeCommand, result: NodeResult) {
        val node = nodeRepository.findById(command.id) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 2)
        val request = command.request

        val newParent: Long? = request.parentId?.takeIf { it != node.parentId }
        if (newParent != null) {
            if (newParent > 0) {
                val parent = nodeRepository.findById(newParent) ?: throw ValidateException(406, "目标父页面不存在")
                if (parent.spaceId != node.spaceId) throw ValidateException(406, "目标父页面不属于该空间")
                val all = nodeRepository.listBySpace(node.spaceId)
                if (NodeTreeSupport.subtreeIds(all, node.id).contains(newParent)) {
                    throw ValidateException(406, "不能移动到自身或其子页面内")
                }
            }
        }
        nodeRepository.update(
            id = node.id,
            title = request.title?.trim()?.takeIf { it.isNotEmpty() }?.take(256),
            parentId = newParent,
            sort = request.sort
        )
        DtoMappers.toNodeResult(nodeRepository.findById(node.id)!!).let {
            result.id = it.id; result.spaceId = it.spaceId; result.parentId = it.parentId
            result.title = it.title; result.sort = it.sort; result.updatedAt = it.updatedAt
        }
    }
}

/** 删除页面：软删进回收站；purge=true 彻底删除（仅空间管理员） */
@Service
class DeleteNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val draftRepository: DraftRepository,
    private val versionRepository: VersionRepository,
    private val favoriteRepository: FavoriteRepository,
    private val activityRepository: ActivityRepository,
    private val commentRepository: tech.eflink.wiki.store.repository.CommentRepository,
    private val blockDataRepository: tech.eflink.wiki.store.repository.BlockDataRepository,
    private val guard: WikiGuard,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService,
    private val searchPort: tech.eflink.wiki.core.search.SearchPort
) : CommandHandlerBase<DeleteNodeCommand, EmptyResult>() {

    override fun handle(command: DeleteNodeCommand, result: EmptyResult) {
        val node = nodeRepository.findById(command.id) ?: throw ValidateException(406, "页面不存在")
        if (command.purge) {
            guard.requireSpaceRole(node.spaceId, 1)
            val all = nodeRepository.listBySpaceIncludeDeleted(node.spaceId)
            val ids = NodeTreeSupport.subtreeIds(all, node.id)
            draftRepository.deleteByNodes(ids)
            versionRepository.deleteByNodes(ids)
            favoriteRepository.deleteByNodes(ids)
            activityRepository.deleteByNodes(ids)
            commentRepository.deleteByNodes(ids)
            blockDataRepository.deleteByNodes(ids)
            nodeRepository.purge(ids)
            searchPort.removeNodes(ids)
            operationLogService.log("node.purge", "node", node.id, "彻底删除页面: ${node.title}")
        } else {
            guard.requireSpaceRole(node.spaceId, 2)
            val all = nodeRepository.listBySpace(node.spaceId)
            nodeRepository.softDelete(NodeTreeSupport.subtreeIds(all, node.id))
            operationLogService.log("node.delete", "node", node.id, "删除页面进回收站: ${node.title}")
        }
    }
}

/** 恢复页面：父页面仍在回收站时挂到空间根 */
@Service
class RestoreNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<RestoreNodeCommand, EmptyResult>() {

    override fun handle(command: RestoreNodeCommand, result: EmptyResult) {
        val node = nodeRepository.findByIdIncludeDeleted(command.id) ?: throw ValidateException(406, "页面不存在")
        if (node.isDel != 1) throw ValidateException(406, "页面不在回收站中")
        guard.requireSpaceRole(node.spaceId, 1)

        val all = nodeRepository.listBySpaceIncludeDeleted(node.spaceId)
        val ids = NodeTreeSupport.subtreeIds(all, node.id)
        nodeRepository.restore(ids)

        // 父页面缺失或仍在回收站：整棵子树挂到空间根
        val parent = node.parentId.takeIf { it > 0 }?.let { pid -> all.find { it.id == pid } }
        if (node.parentId > 0 && (parent == null || parent.isDel == 1)) {
            nodeRepository.updateParent(ids, 0)
        }
    }
}

/** 回收站列表（仅空间管理员） */
@Service
class ListTrashCommandHandler(
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ListTrashCommand, TrashListResult>() {

    override fun handle(command: ListTrashCommand, result: TrashListResult) {
        guard.requireSpaceRole(command.spaceId, 1)
        result.list = nodeRepository.listTrash(command.spaceId).map { node ->
            tech.eflink.wiki.contract.wiki.TrashNodeResult().apply {
                id = node.id
                parentId = node.parentId
                title = node.title
                deletedAt = DtoMappers.epoch(node.deletedAt)
            }
        }.toMutableList()
    }
}
