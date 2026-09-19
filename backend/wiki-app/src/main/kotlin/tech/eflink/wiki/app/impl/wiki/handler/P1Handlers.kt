package tech.eflink.wiki.app.impl.wiki.handler

import cn.hutool.poi.excel.ExcelUtil
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.OperationLogService
import tech.eflink.wiki.app.service.PasswordService
import tech.eflink.wiki.contract.admin.ImportUsersResult
import tech.eflink.wiki.contract.admin.ListOperationsCommand
import tech.eflink.wiki.contract.admin.OperationLogResult
import tech.eflink.wiki.contract.admin.OperationPageResult
import tech.eflink.wiki.contract.wiki.AddCommentCommand
import tech.eflink.wiki.contract.wiki.CommentListResult
import tech.eflink.wiki.contract.wiki.CommentResult
import tech.eflink.wiki.contract.wiki.DeleteCommentCommand
import tech.eflink.wiki.contract.wiki.DraftResult
import tech.eflink.wiki.contract.wiki.EmbedDataResult
import tech.eflink.wiki.contract.wiki.GetEmbedDataCommand
import tech.eflink.wiki.contract.wiki.GetSpaceStatsCommand
import tech.eflink.wiki.contract.wiki.GetTemplateCommand
import tech.eflink.wiki.contract.wiki.ListCommentsCommand
import tech.eflink.wiki.contract.wiki.RestoreVersionCommand
import tech.eflink.wiki.contract.wiki.SaveAsTemplateCommand
import tech.eflink.wiki.contract.wiki.SaveEmbedDataCommand
import tech.eflink.wiki.contract.wiki.SpaceStatsResult
import tech.eflink.wiki.contract.wiki.TemplateDetailResult
import tech.eflink.wiki.contract.wiki.TemplateListResult
import tech.eflink.wiki.contract.wiki.TemplateResult
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.BlockDataRepository
import tech.eflink.wiki.store.repository.CommentRepository
import tech.eflink.wiki.store.repository.DraftRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.OperationLogRepository
import tech.eflink.wiki.store.repository.StatsRepository
import tech.eflink.wiki.store.repository.TemplateRepository
import tech.eflink.wiki.store.repository.UserRepository
import tech.eflink.wiki.store.repository.VersionRepository
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// ==================== 评论 ====================

@Service
class ListCommentsCommandHandler(
    private val commentRepository: CommentRepository,
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<ListCommentsCommand, CommentListResult>() {

    override fun handle(command: ListCommentsCommand, result: CommentListResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 3)
        result.list = commentRepository.listByNode(node.id).map { row ->
            CommentResult().apply {
                id = row["id"] as Long
                nodeId = node.id
                parentId = row["parentId"] as Long
                content = row["content"] as String
                userId = row["userId"] as Long
                username = row["username"] as String
                displayName = row["displayName"] as String
                avatar = row["avatar"] as String?
                createdAt = DtoMappers.epoch(row["createdAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}

@Service
class AddCommentCommandHandler(
    private val commentRepository: CommentRepository,
    private val nodeRepository: NodeRepository,
    private val spaceRepository: tech.eflink.wiki.store.repository.SpaceRepository,
    private val userRepository: tech.eflink.wiki.store.repository.UserRepository,
    private val notificationService: tech.eflink.wiki.app.service.NotificationService,
    private val guard: WikiGuard
) : CommandHandlerBase<AddCommentCommand, CommentResult>() {

    override fun validate(command: AddCommentCommand) {
        require(command.request.content.isNotBlank()) { "评论内容不能为空" }
    }

    override fun handle(command: AddCommentCommand, result: CommentResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 3)
        val parent = if (command.request.parentId > 0) {
            commentRepository.findById(command.request.parentId)
                ?: throw ValidateException(406, "回复的评论不存在")
        } else null
        val id = commentRepository.create(
            nodeId = node.id,
            userId = access.userId,
            parentId = command.request.parentId,
            content = command.request.content.trim().take(2000)
        )
        // 通知触发：@提及（仅空间内成员，后端按空间角色校验）+ 页面作者 + 被回复人，各自去重且不打扰动作本人
        val space = spaceRepository.findById(node.spaceId)
        val actorName = userRepository.findById(access.userId)?.displayName?.ifBlank { null }
            ?: AuthContext.currentUsername()
        val mentioned = command.request.mentionUserIds
            .filter { it != access.userId }
            .filter { space != null && guard.resolveRole(space, it) > 0 }
            .toSet()
        if (space != null) {
            mentioned.forEach {
                notificationService.notifyMentioned(it, actorName, node.title, node.spaceId, node.id)
            }
            val recipients = mutableSetOf<Long>()
            if (node.createdBy != access.userId && node.createdBy !in mentioned) {
                recipients.add(node.createdBy)
            }
            if (parent != null && parent.userId != access.userId && parent.userId !in mentioned) {
                recipients.add(parent.userId)
            }
            recipients.forEach {
                if (parent != null && it == parent.userId) {
                    notificationService.notifyCommentReplied(it, actorName, node.title, node.spaceId, node.id, id)
                } else {
                    notificationService.notifyPageCommented(it, actorName, node.title, node.spaceId, node.id, id)
                }
            }
        }
        result.apply {
            this.id = id
            nodeId = node.id
            parentId = command.request.parentId
            content = command.request.content.trim()
            userId = access.userId
            username = AuthContext.currentUsername()
            displayName = AuthContext.currentUsername()
            createdAt = System.currentTimeMillis()
        }
    }
}

@Service
class DeleteCommentCommandHandler(
    private val commentRepository: CommentRepository,
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<DeleteCommentCommand, EmptyResult>() {

    override fun handle(command: DeleteCommentCommand, result: EmptyResult) {
        val comment = commentRepository.findById(command.commentId)
            ?: throw ValidateException(406, "评论不存在")
        val node = nodeRepository.findById(comment.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 3)
        // 本人、空间管理员、系统管理员可删
        if (comment.userId != access.userId && access.role > 1) {
            throw ValidateException(406, "没有权限删除该评论")
        }
        commentRepository.softDelete(comment.id)
    }
}

// ==================== 版本回滚 ====================

@Service
class RestoreVersionCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val draftRepository: DraftRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<RestoreVersionCommand, DraftResult>() {

    override fun handle(command: RestoreVersionCommand, result: DraftResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)
        val version = versionRepository.findByNodeAndNo(node.id, command.versionNo)
            ?: throw ValidateException(406, "版本不存在")
        draftRepository.upsert(node.id, access.userId, version.content ?: "", version.id)
        val draft = draftRepository.findByNodeAndUser(node.id, access.userId)!!
        result.apply {
            nodeId = node.id
            content = draft.content
            baseVersionId = draft.baseVersionId
            updatedAt = DtoMappers.epoch(draft.updatedAt)
            currentVersionNo = version.versionNo
        }
    }
}

// ==================== 嵌入块数据 ====================

@Service
class GetEmbedDataCommandHandler(
    private val blockDataRepository: BlockDataRepository,
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetEmbedDataCommand, EmbedDataResult>() {

    override fun handle(command: GetEmbedDataCommand, result: EmbedDataResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 3)
        val block = blockDataRepository.findByNodeAndEmbed(command.nodeId, command.embedId)
        result.apply {
            nodeId = command.nodeId
            embedId = command.embedId
            type = block?.type ?: ""
            title = block?.title ?: ""
            content = block?.content
            updatedAt = DtoMappers.epoch(block?.updatedAt)
        }
    }
}

@Service
class SaveEmbedDataCommandHandler(
    private val blockDataRepository: BlockDataRepository,
    private val nodeRepository: NodeRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<SaveEmbedDataCommand, EmbedDataResult>() {

    override fun validate(command: SaveEmbedDataCommand) {
        require(command.request.type in setOf("word", "excel", "pptx", "draw", "mindmap")) { "嵌入块类型不合法" }
    }

    override fun handle(command: SaveEmbedDataCommand, result: EmbedDataResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)
        blockDataRepository.upsert(
            nodeId = node.id,
            embedId = command.embedId,
            type = command.request.type,
            title = command.request.title,
            content = command.request.content,
            updatedBy = access.userId
        )
        val block = blockDataRepository.findByNodeAndEmbed(node.id, command.embedId)!!
        result.apply {
            nodeId = node.id
            embedId = command.embedId
            type = block.type
            title = block.title
            content = block.content
            updatedAt = DtoMappers.epoch(block.updatedAt)
        }
    }
}

// ==================== 数据统计 ====================

@Service
class GetSpaceStatsCommandHandler(
    private val nodeRepository: NodeRepository,
    private val statsRepository: StatsRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<GetSpaceStatsCommand, SpaceStatsResult>() {

    override fun handle(command: GetSpaceStatsCommand, result: SpaceStatsResult) {
        guard.requireSpaceRole(command.spaceId, 3)
        result.nodeCount = nodeRepository.countBySpace(command.spaceId)
        result.totalViews = statsRepository.totalViews(command.spaceId)
        result.versionCount = statsRepository.versionCount(command.spaceId)

        // 近 30 天浏览趋势（无浏览日期补 0）
        val byDate = statsRepository.dailyViews(command.spaceId, 30).toMap()
        val today = LocalDate.now()
        (29 downTo 0).forEach { offset ->
            val day = today.minusDays(offset.toLong())
            result.dailyViews.add(
                tech.eflink.wiki.contract.wiki.DailyView().apply {
                    date = day.format(DateTimeFormatter.ISO_LOCAL_DATE)
                    views = byDate[day.toString()] ?: 0
                }
            )
        }

        statsRepository.contributors(command.spaceId).forEach { row ->
            result.contributors.add(
                tech.eflink.wiki.contract.wiki.Contributor().apply {
                    userId = row["userId"] as Long
                    displayName = row["displayName"] as String
                    publishes = row["publishes"] as Long
                    views = row["views"] as Long
                }
            )
        }

        nodeRepository.listBySpace(command.spaceId)
            .sortedByDescending { it.updatedAt }
            .take(10)
            .forEach { node ->
                result.recentNodes.add(
                    tech.eflink.wiki.contract.wiki.RecentNode().apply {
                        id = node.id
                        title = node.title
                        updatedAt = DtoMappers.epoch(node.updatedAt)
                    }
                )
            }
    }
}

// ==================== 模板 ====================

@Service
class SaveAsTemplateCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val draftRepository: DraftRepository,
    private val templateRepository: TemplateRepository,
    private val userRepository: UserRepository,
    private val guard: WikiGuard
) : CommandHandlerBase<SaveAsTemplateCommand, TemplateResult>() {

    override fun validate(command: SaveAsTemplateCommand) {
        require(command.request.title.isNotBlank()) { "模板名称不能为空" }
    }

    override fun handle(command: SaveAsTemplateCommand, result: TemplateResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)
        // 优先取已发布版本，其次我的草稿
        val content = node.currentVersionId?.let { versionRepository.findById(it)?.content }
            ?: draftRepository.findByNodeAndUser(node.id, access.userId)?.content
        val id = templateRepository.create(
            title = command.request.title.trim().take(256),
            description = command.request.description?.trim()?.takeIf { it.isNotEmpty() },
            content = content,
            createdBy = access.userId
        )
        val template = templateRepository.findById(id)!!
        result.apply {
            this.id = template.id
            title = template.title
            description = template.description
            createdByName = userRepository.findById(template.createdBy)?.displayName
            createdAt = DtoMappers.epoch(template.createdAt)
        }
    }
}

@Service
class ListTemplatesCommandHandler(
    private val templateRepository: TemplateRepository
) : CommandHandlerBase<tech.eflink.wiki.contract.wiki.ListTemplatesCommand, TemplateListResult>() {

    override fun handle(command: tech.eflink.wiki.contract.wiki.ListTemplatesCommand, result: TemplateListResult) {
        result.list = templateRepository.listAll().map { row ->
            val record = row["record"] as tech.eflink.wiki.database.tables.records.WikiTemplateRecord
            TemplateResult().apply {
                id = record.id
                title = record.title
                description = record.description
                createdByName = row["creatorName"] as String?
                createdAt = DtoMappers.epoch(record.createdAt)
            }
        }.toMutableList()
    }
}

@Service
class GetTemplateCommandHandler(
    private val templateRepository: TemplateRepository
) : CommandHandlerBase<GetTemplateCommand, TemplateDetailResult>() {

    override fun handle(command: GetTemplateCommand, result: TemplateDetailResult) {
        val template = templateRepository.findById(command.id) ?: throw ValidateException(406, "模板不存在")
        result.apply {
            id = template.id
            title = template.title
            description = template.description
            content = template.content
        }
    }
}

@Service
class DeleteTemplateCommandHandler(
    private val templateRepository: TemplateRepository
) : CommandHandlerBase<tech.eflink.wiki.contract.wiki.DeleteTemplateCommand, EmptyResult>() {

    override fun handle(command: tech.eflink.wiki.contract.wiki.DeleteTemplateCommand, result: EmptyResult) {
        val template = templateRepository.findById(command.id) ?: throw ValidateException(406, "模板不存在")
        if (template.createdBy != AuthContext.currentUserId() && !AuthContext.isSystemAdmin()) {
            throw ValidateException(406, "只有模板创建人或系统管理员可删除")
        }
        templateRepository.delete(template.id)
    }
}

// ==================== 管理后台：审计 + 批量导入 ====================

@Service
class ListOperationsCommandHandler(
    private val operationLogRepository: OperationLogRepository
) : CommandHandlerBase<ListOperationsCommand, OperationPageResult>() {

    override fun validate(command: ListOperationsCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: ListOperationsCommand, result: OperationPageResult) {
        val page = command.request.page.coerceAtLeast(1)
        val size = command.request.size.coerceIn(1, 100)
        result.page = page
        result.size = size
        result.total = operationLogRepository.count(command.request.action, command.request.userId)
        result.list = operationLogRepository.page(command.request.action, command.request.userId, (page - 1) * size, size)
            .map { row ->
                val record = row["record"] as tech.eflink.wiki.database.tables.records.OperationLogRecord
                OperationLogResult().apply {
                    id = record.id
                    userId = record.userId
                    username = record.username
                    action = record.action
                    targetType = record.targetType
                    targetId = record.targetId
                    detail = record.detail
                    ip = record.ip
                    createdAt = DtoMappers.epoch(record.createdAt)
                }
            }.toMutableList()
    }
}

@Service
class ImportUsersCommandHandler(
    private val userRepository: UserRepository,
    private val passwordService: PasswordService,
    private val licenseService: tech.eflink.wiki.app.service.LicenseService,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService
) : CommandHandlerBase<tech.eflink.wiki.contract.admin.ImportUsersCommand, ImportUsersResult>() {

    override fun validate(command: tech.eflink.wiki.contract.admin.ImportUsersCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    /** xlsx/csv 均交给 hutool 读取；列：用户名、姓名、初始密码(可选)、角色(可选：管理员/普通用户)，首行为表头 */
    override fun handle(command: tech.eflink.wiki.contract.admin.ImportUsersCommand, result: ImportUsersResult) {
        val reader = ExcelUtil.getReader(command.file.inputStream)
        val rows: List<List<Any?>> = reader.read()
        if (rows.size <= 1) throw ValidateException(406, "文件没有数据行")
        rows.drop(1).forEachIndexed { index, row ->
            val line = index + 2
            fun cell(i: Int): String = row.getOrNull(i)?.toString()?.trim().orEmpty()
            val username = cell(0)
            val displayName = cell(1)
            val password = cell(2).takeIf { it.isNotEmpty() } ?: "123456"
            val roleName = cell(3)
            val role = if (roleName.contains("管理")) 1 else 2
            try {
                require(username.length in 3..64) { "账号长度需在 3-64 位" }
                require(!username.contains(' ')) { "账号不能包含空格" }
                require(displayName.isNotEmpty()) { "姓名不能为空" }
                require(password.length >= 6) { "初始密码至少 6 位" }
                if (userRepository.findByUsername(username) != null) {
                    result.skipped++
                    result.errors.add("第${line}行：账号 $username 已存在，跳过")
                    return@forEachIndexed
                }
                licenseService.assertCanCreateUser()
                userRepository.create(username, passwordService.encode(password), displayName, role)
                result.created++
            } catch (ex: Exception) {
                result.errors.add("第${line}行：${ex.message ?: "导入失败"}")
            }
        }
    }
}
