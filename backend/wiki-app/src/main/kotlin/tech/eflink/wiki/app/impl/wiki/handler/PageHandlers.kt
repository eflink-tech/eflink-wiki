package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.contract.wiki.DraftItemListResult
import tech.eflink.wiki.contract.wiki.DraftItemResult
import tech.eflink.wiki.contract.wiki.DraftResult
import tech.eflink.wiki.contract.wiki.DraftSaveResult
import tech.eflink.wiki.contract.wiki.GetDraftCommand
import tech.eflink.wiki.contract.wiki.GetPageCommand
import tech.eflink.wiki.contract.wiki.GetVersionCommand
import tech.eflink.wiki.contract.wiki.ListMyDraftsCommand
import tech.eflink.wiki.contract.wiki.ListVersionsCommand
import tech.eflink.wiki.contract.wiki.PageResult
import tech.eflink.wiki.contract.wiki.PublishNodeCommand
import tech.eflink.wiki.contract.wiki.PublishResult
import tech.eflink.wiki.contract.wiki.SaveDraftCommand
import tech.eflink.wiki.contract.wiki.VersionListResult
import tech.eflink.wiki.contract.wiki.VersionResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.ActivityRepository
import tech.eflink.wiki.store.repository.DraftRepository
import tech.eflink.wiki.store.repository.FavoriteRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.UserRepository
import tech.eflink.wiki.store.repository.VersionRepository

/** 读取已发布页面：viewer 可读，累计浏览计数，附收藏状态 */
@Service
class GetPageCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val userRepository: UserRepository,
    private val favoriteRepository: FavoriteRepository,
    private val activityRepository: ActivityRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetPageCommand, PageResult>() {

    override fun handle(command: GetPageCommand, result: PageResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 3)

        val version = node.currentVersionId?.let { versionRepository.findById(it) }
        result.nodeId = node.id
        result.title = node.title
        result.content = version?.content
        result.versionNo = version?.versionNo
        result.publishedAt = DtoMappers.epoch(version?.publishedAt)
        result.publishedByName = version?.let { userRepository.findById(it.publishedBy)?.displayName }
        result.viewCount = activityRepository.countViews(node.id)
        result.favorited = favoriteRepository.findByUserAndNode(access.userId, node.id) != null
        // 正在编辑的同事（10 分钟内有编辑动作的其他用户）
        result.editingUsers = activityRepository.recentEditors(node.id, access.userId, 10).toMutableList()

        // 浏览计数（浏览动作流水）
        activityRepository.insert(node.id, node.spaceId, access.userId, 1)
    }
}

/** 读取我的草稿（含当前已发布版本号） */
@Service
class GetDraftCommandHandler(
    private val nodeRepository: NodeRepository,
    private val draftRepository: DraftRepository,
    private val versionRepository: VersionRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetDraftCommand, DraftResult>() {

    override fun handle(command: GetDraftCommand, result: DraftResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 2)
        val userId = AuthContext.currentUserId()
        val draft = draftRepository.findByNodeAndUser(node.id, userId)
        result.nodeId = node.id
        result.content = draft?.content
        result.baseVersionId = draft?.baseVersionId
        result.updatedAt = DtoMappers.epoch(draft?.updatedAt)
        result.currentVersionNo = node.currentVersionId?.let { versionRepository.findById(it)?.versionNo }
    }
}

/** 保存草稿（编辑器防抖自动保存） */
@Service
class SaveDraftCommandHandler(
    private val nodeRepository: NodeRepository,
    private val draftRepository: DraftRepository,
    private val activityRepository: ActivityRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<SaveDraftCommand, DraftSaveResult>() {

    override fun handle(command: SaveDraftCommand, result: DraftSaveResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)
        draftRepository.upsert(
            nodeId = node.id,
            userId = access.userId,
            content = command.request.content,
            baseVersionId = command.request.baseVersionId
        )
        // 编辑 presence 心跳（供同页其他访问者看到"正在编辑"）
        activityRepository.insert(node.id, node.spaceId, access.userId, 2)
        result.updatedAt = System.currentTimeMillis()
    }
}

/** 发布页面：我的草稿 → 新版本快照，并清空该页面全部草稿 */
@Service
class PublishNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val draftRepository: DraftRepository,
    private val versionRepository: VersionRepository,
    private val blockDataRepository: tech.eflink.wiki.store.repository.BlockDataRepository,
    private val activityRepository: ActivityRepository,
    private val guard: WikiGuard,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService,
    private val webhookService: tech.eflink.wiki.app.service.WebhookService,
    private val searchPort: tech.eflink.wiki.core.search.SearchPort,
    private val spaceRepository: tech.eflink.wiki.store.repository.SpaceRepository,
    private val userRepository: UserRepository,
    private val mentionExtractor: tech.eflink.wiki.app.service.MentionExtractor,
    private val notificationService: tech.eflink.wiki.app.service.NotificationService
) : CommandHandlerBase<PublishNodeCommand, PublishResult>() {

    override fun handle(command: PublishNodeCommand, result: PublishResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)

        val draft = draftRepository.findByNodeAndUser(node.id, access.userId)
        // 嵌入块（流程图/脑图等）是实时数据，编辑它们不产生页面草稿：
        // 无草稿时只要当前版本发布之后有嵌入块更新，同样允许发布（新版本沿用已发布正文，作为发布记录）
        val currentVersion = node.currentVersionId?.let { versionRepository.findById(it) }
        if (draft == null) {
            if (currentVersion == null) throw ValidateException(406, "暂无可发布的内容，请先编辑保存")
            if (!blockDataRepository.existsUpdatedAfter(node.id, currentVersion.publishedAt)) {
                throw ValidateException(406, "内容没有变化，无需发布")
            }
        }
        val title = command.request.title?.trim()?.takeIf { it.isNotEmpty() } ?: node.title
        val content = draft?.content ?: currentVersion?.content

        val versionNo = versionRepository.nextVersionNo(node.id)
        val versionId = versionRepository.create(
            nodeId = node.id,
            versionNo = versionNo,
            title = title.take(256),
            content = content,
            publishedBy = access.userId
        )
        nodeRepository.update(node.id, title = title.take(256))
        nodeRepository.setCurrentVersion(node.id, versionId)
        draftRepository.deleteByNode(node.id)
        activityRepository.insert(node.id, node.spaceId, access.userId, 3)
        operationLogService.log("node.publish", "node", node.id, "发布《${title}》v$versionNo")
        // 同步全文检索索引 + 推送 Webhook 事件
        searchPort.indexNode(node.id, title.take(256), content)
        webhookService.dispatch(
            "node.publish",
            mapOf(
                "nodeId" to node.id,
                "spaceId" to node.spaceId,
                "title" to title,
                "versionNo" to versionNo,
                "publishedBy" to access.userId
            )
        )
        // @提及通知：新版本提及集合 − 上一版本提及集合，只通知本次新增（且仍在空间内、非发布者本人）
        val space = spaceRepository.findById(node.spaceId)
        if (space != null) {
            val newMentions = mentionExtractor.extract(content)
            val oldMentions = mentionExtractor.extract(currentVersion?.content)
            val actorName = userRepository.findById(access.userId)?.displayName?.ifBlank { null }
                ?: AuthContext.currentUsername()
            (newMentions - oldMentions)
                .filter { it != access.userId && guard.resolveRole(space, it) > 0 }
                .forEach {
                    notificationService.notifyMentioned(it, actorName, title, node.spaceId, node.id)
                }
        }
        result.versionNo = versionNo
    }
}

/** 版本列表 */
@Service
class ListVersionsCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ListVersionsCommand, VersionListResult>() {

    override fun handle(command: ListVersionsCommand, result: VersionListResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 3)
        result.list = versionRepository.listByNode(node.id).map { row ->
            tech.eflink.wiki.contract.wiki.VersionItemResult().apply {
                versionNo = row["versionNo"] as Int
                title = row["title"] as String
                publishedByName = row["publisherName"] as String?
                publishedAt = DtoMappers.epoch(row["publishedAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}

/** 版本详情 */
@Service
class GetVersionCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val userRepository: UserRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetVersionCommand, VersionResult>() {

    override fun handle(command: GetVersionCommand, result: VersionResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 3)
        val version = versionRepository.findByNodeAndNo(node.id, command.versionNo)
            ?: throw ValidateException(406, "版本不存在")
        result.versionNo = version.versionNo
        result.title = version.title
        result.content = version.content
        result.publishedByName = userRepository.findById(version.publishedBy)?.displayName
        result.publishedAt = DtoMappers.epoch(version.publishedAt)
    }
}

/** 放弃我的草稿 */
@Service
class DeleteDraftCommandHandler(
    private val nodeRepository: NodeRepository,
    private val draftRepository: DraftRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<tech.eflink.wiki.contract.wiki.DeleteDraftCommand, tech.eflink.wiki.core.communication.EmptyResult>() {

    override fun handle(command: tech.eflink.wiki.contract.wiki.DeleteDraftCommand, result: tech.eflink.wiki.core.communication.EmptyResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 2)
        draftRepository.deleteByNodeAndUser(node.id, AuthContext.currentUserId())
    }
}

/** 我的草稿箱（跨空间） */
@Service
class ListMyDraftsCommandHandler(
    private val draftRepository: DraftRepository
) : CommandHandlerBase<ListMyDraftsCommand, DraftItemListResult>() {

    override fun handle(command: ListMyDraftsCommand, result: DraftItemListResult) {
        result.list = draftRepository.listMyDrafts(AuthContext.currentUserId()).map { row ->
            DraftItemResult().apply {
                nodeId = row["nodeId"] as Long
                spaceId = row["spaceId"] as Long
                title = row["title"] as String
                spaceName = row["spaceName"] as? String ?: ""
                updatedAt = DtoMappers.epoch(row["updatedAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}
