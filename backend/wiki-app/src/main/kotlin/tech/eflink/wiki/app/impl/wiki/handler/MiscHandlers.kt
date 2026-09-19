package tech.eflink.wiki.app.impl.wiki.handler

import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.storage.StorageService
import tech.eflink.wiki.contract.wiki.FavoriteListResult
import tech.eflink.wiki.contract.wiki.FavoriteResult
import tech.eflink.wiki.contract.wiki.FavoriteToggleResult
import tech.eflink.wiki.contract.wiki.ListFavoritesCommand
import tech.eflink.wiki.contract.wiki.ListRecentOpensCommand
import tech.eflink.wiki.contract.wiki.RecordRecentOpenCommand
import tech.eflink.wiki.contract.wiki.RecentOpenListResult
import tech.eflink.wiki.contract.wiki.RecentOpenResult
import tech.eflink.wiki.contract.wiki.SearchCommand
import tech.eflink.wiki.contract.wiki.SearchItemResult
import tech.eflink.wiki.contract.wiki.SearchListResult
import tech.eflink.wiki.contract.wiki.ToggleFavoriteCommand
import tech.eflink.wiki.contract.wiki.UploadFileCommand
import tech.eflink.wiki.contract.wiki.UploadResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.FavoriteRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.RecentOpenRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.VersionRepository

/** 我的收藏列表 */
@Service
class ListFavoritesCommandHandler(
    private val favoriteRepository: FavoriteRepository
) : CommandHandlerBase<ListFavoritesCommand, FavoriteListResult>() {

    override fun handle(command: ListFavoritesCommand, result: FavoriteListResult) {
        result.list = favoriteRepository.listByUser(AuthContext.currentUserId()).map { row ->
            FavoriteResult().apply {
                nodeId = row["nodeId"] as Long
                spaceId = row["spaceId"] as Long
                title = row["title"] as String
                createdAt = DtoMappers.epoch(row["createdAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}

/** 收藏/取消收藏（切换） */
@Service
class ToggleFavoriteCommandHandler(
    private val nodeRepository: NodeRepository,
    private val favoriteRepository: FavoriteRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ToggleFavoriteCommand, FavoriteToggleResult>() {

    override fun handle(command: ToggleFavoriteCommand, result: FavoriteToggleResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 3)
        val existing = favoriteRepository.findByUserAndNode(access.userId, node.id)
        if (existing != null) {
            favoriteRepository.delete(access.userId, node.id)
            result.favorited = false
        } else {
            favoriteRepository.insert(access.userId, node.id)
            result.favorited = true
        }
    }
}

/** 全文搜索：检索（SPI：MySQL ngram / Meilisearch）→ 空间权限过滤 → 组装 */
@Service
class SearchCommandHandler(
    private val nodeRepository: NodeRepository,
    private val spaceRepository: SpaceRepository,
    private val versionRepository: VersionRepository,
    private val searchPort: tech.eflink.wiki.core.search.SearchPort,
    private val guard: WikiGuard
) : CommandHandlerBase<SearchCommand, SearchListResult>() {

    override fun validate(command: SearchCommand) {
        require(command.keyword.isNotBlank()) { "请输入搜索关键字" }
    }

    override fun handle(command: SearchCommand, result: SearchListResult) {
        val visibleRoles = guard.visibleSpaceRoles()
        val spaceFilter = command.spaceId
        val nodeIds = searchPort.searchNodeIds(command.keyword.trim(), 200)
        if (nodeIds.isEmpty()) return

        // 过滤出我有权限访问的空间内的节点
        val candidates = nodeIds.mapNotNull { nodeRepository.findById(it) }
            .filter { visibleRoles.containsKey(it.spaceId) }
            .filter { spaceFilter == null || it.spaceId == spaceFilter }
            .take(50)
        if (candidates.isEmpty()) return

        val spaceNames = spaceRepository.listVisible(AuthContext.currentUserId(), AuthContext.isSystemAdmin())
            .associate { it.space.id to it.space.name }
        result.list = candidates.map { node ->
            SearchItemResult().apply {
                nodeId = node.id
                spaceId = node.spaceId
                spaceName = spaceNames[node.spaceId] ?: ""
                title = node.title
                versionNo = node.currentVersionId?.let { vid ->
                    versionRepository.findById(vid)?.versionNo
                }
                updatedAt = DtoMappers.epoch(node.updatedAt)
            }
        }.toMutableList()
    }
}

/** 上传文件（本地磁盘存储） */
/** 允许上传的文件扩展名（图片 / 文档 / 压缩包 / 音视频） */
val ALLOWED_UPLOAD_EXTENSIONS = setOf(
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
    "pdf", "txt", "md", "csv",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "zip", "7z", "rar", "tar", "gz",
    "mp4", "webm", "mov", "avi", "mkv",
    "mp3", "wav", "m4a", "ogg", "flac", "aac"
)

@Service
class UploadFileCommandHandler(
    private val storageService: StorageService
) : CommandHandlerBase<UploadFileCommand, UploadResult>() {

    override fun validate(command: UploadFileCommand) {
        require(!command.file.isEmpty) { "请选择要上传的文件" }
        val ext = command.file.originalFilename?.substringAfterLast('.', "")?.lowercase().orEmpty()
        if (ext !in ALLOWED_UPLOAD_EXTENSIONS) throw ValidateException(406, "不支持的文件类型: .$ext")
    }

    override fun handle(command: UploadFileCommand, result: UploadResult) {
        result.url = storageService.save(command.file)
    }
}

/** 记录页面打开（需空间查看权限；页面不存在时直接忽略） */
@Service
class RecordRecentOpenCommandHandler(
    private val nodeRepository: NodeRepository,
    private val recentOpenRepository: RecentOpenRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<RecordRecentOpenCommand, EmptyResult>() {

    override fun handle(command: RecordRecentOpenCommand, result: EmptyResult) {
        val node = nodeRepository.findById(command.nodeId) ?: return
        val access = guard.requireSpaceRole(node.spaceId, 3)
        recentOpenRepository.upsert(access.userId, node.id)
    }
}

/** 我的最近打开页面列表 */
@Service
class ListRecentOpensCommandHandler(
    private val recentOpenRepository: RecentOpenRepository
) : CommandHandlerBase<ListRecentOpensCommand, RecentOpenListResult>() {

    override fun handle(command: ListRecentOpensCommand, result: RecentOpenListResult) {
        result.list = recentOpenRepository.listByUser(AuthContext.currentUserId(), 10).map { row ->
            RecentOpenResult().apply {
                nodeId = row["nodeId"] as Long
                spaceId = row["spaceId"] as Long
                title = row["title"] as String
                spaceName = row["spaceName"] as? String ?: ""
                openedAt = DtoMappers.epoch(row["openedAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}
