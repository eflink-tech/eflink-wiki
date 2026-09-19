package tech.eflink.wiki.app.impl.wiki.handler

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.LicenseService
import tech.eflink.wiki.app.service.WebhookService
import tech.eflink.wiki.contract.admin.ApiKeyCreatedResult
import tech.eflink.wiki.contract.admin.ApiKeyListResult
import tech.eflink.wiki.contract.admin.ApiKeyResult
import tech.eflink.wiki.contract.admin.CreateApiKeyCommand
import tech.eflink.wiki.contract.admin.CreateApiKeyRequest
import tech.eflink.wiki.contract.admin.CreateWebhookCommand
import tech.eflink.wiki.contract.admin.DeleteApiKeyCommand
import tech.eflink.wiki.contract.admin.DeleteWebhookCommand
import tech.eflink.wiki.contract.admin.GetLicenseStateCommand
import tech.eflink.wiki.contract.admin.LicenseStateResult
import tech.eflink.wiki.contract.admin.ListApiKeysCommand
import tech.eflink.wiki.contract.admin.ListWebhookDeliveriesCommand
import tech.eflink.wiki.contract.admin.ListWebhooksCommand
import tech.eflink.wiki.contract.admin.SaveWebhookRequest
import tech.eflink.wiki.contract.admin.UpdateWebhookCommand
import tech.eflink.wiki.contract.admin.UploadLicenseCommand
import tech.eflink.wiki.contract.admin.WebhookDeliveryListResult
import tech.eflink.wiki.contract.admin.WebhookDeliveryResult
import tech.eflink.wiki.contract.admin.WebhookListResult
import tech.eflink.wiki.contract.admin.WebhookResult
import tech.eflink.wiki.core.communication.CommandHandlerBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.ActivityRepository
import tech.eflink.wiki.store.repository.ApiKeyRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.OperationLogRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.UserRepository
import tech.eflink.wiki.store.repository.VersionRepository
import tech.eflink.wiki.store.repository.WebhookRepository
import java.security.SecureRandom
import java.util.Base64

// ==================== License ====================

@Service
class GetLicenseStateCommandHandler(private val licenseService: LicenseService) :
    CommandHandlerBase<GetLicenseStateCommand, LicenseStateResult>() {

    override fun validate(command: GetLicenseStateCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: GetLicenseStateCommand, result: LicenseStateResult) {
        val state = licenseService.state()
        result.apply {
            present = state.present
            valid = state.valid
            reason = state.reason
            licensee = state.licensee
            expiresAt = state.expiresAt
            maxUsers = state.maxUsers
            usedUsers = state.usedUsers
            features = state.features.toMutableList()
        }
    }
}

@Service
class UploadLicenseCommandHandler(
    private val licenseService: LicenseService,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService
) : CommandHandlerBase<UploadLicenseCommand, LicenseStateResult>() {

    override fun validate(command: UploadLicenseCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: UploadLicenseCommand, result: LicenseStateResult) {
        val content = command.file?.bytes?.toString(Charsets.UTF_8) ?: command.content
        if (content.isNullOrBlank()) throw ValidateException(406, "请上传授权文件或粘贴授权内容")
        val node = licenseService.verifyAndParse(content)
        licenseService.save(content, node, AuthContext.currentUserId())
        operationLogService.log("license.upload", "license", null, "上传授权：${node.get("licensee")?.asText()}")
        val state = licenseService.state()
        result.apply {
            present = state.present
            valid = state.valid
            reason = state.reason
            licensee = state.licensee
            expiresAt = state.expiresAt
            maxUsers = state.maxUsers
            usedUsers = state.usedUsers
            features = state.features.toMutableList()
        }
    }
}

// ==================== Webhook ====================

private val random = SecureRandom()

private fun randomSecret(): String {
    val bytes = ByteArray(24)
    random.nextBytes(bytes)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

@Service
class ListWebhooksCommandHandler(private val webhookRepository: WebhookRepository) :
    CommandHandlerBase<ListWebhooksCommand, WebhookListResult>() {

    override fun validate(command: ListWebhooksCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: ListWebhooksCommand, result: WebhookListResult) {
        result.list = webhookRepository.listAll().map { toResult(it) }.toMutableList()
    }

    private fun toResult(r: tech.eflink.wiki.database.tables.records.WebhookRecord): WebhookResult =
        WebhookResult().apply {
            id = r.id; name = r.name; url = r.url; events = r.events; status = r.status
            createdAt = DtoMappers.epoch(r.createdAt)
        }
}

@Service
class CreateWebhookCommandHandler(
    private val webhookRepository: WebhookRepository,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService
) : CommandHandlerBase<CreateWebhookCommand, WebhookResult>() {

    override fun validate(command: CreateWebhookCommand) {
        require(command.request.name.isNotBlank()) { "名称不能为空" }
        require(command.request.url.startsWith("http")) { "推送地址必须是 http(s) URL" }
    }

    override fun handle(command: CreateWebhookCommand, result: WebhookResult) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
        val request = command.request
        val id = webhookRepository.create(
            name = request.name.trim(),
            url = request.url.trim(),
            secret = request.secret?.takeIf { it.isNotBlank() } ?: randomSecret(),
            events = request.events.ifBlank { "*" },
            createdBy = AuthContext.currentUserId()
        )
        operationLogService.log("webhook.create", "webhook", id, "创建 Webhook：${request.name}")
        webhookRepository.findById(id)!!.let {
            result.id = it.id; result.name = it.name; result.url = it.url
            result.events = it.events; result.status = it.status; result.createdAt = DtoMappers.epoch(it.createdAt)
        }
    }
}

@Service
class UpdateWebhookCommandHandler(private val webhookRepository: WebhookRepository) :
    CommandHandlerBase<UpdateWebhookCommand, WebhookResult>() {

    override fun validate(command: UpdateWebhookCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: UpdateWebhookCommand, result: WebhookResult) {
        val hook = webhookRepository.findById(command.id) ?: throw ValidateException(406, "订阅不存在")
        val request = command.request
        webhookRepository.update(
            id = hook.id,
            name = request.name.takeIf { it.isNotBlank() },
            url = request.url.takeIf { it.startsWith("http") },
            secret = request.secret?.takeIf { it.isNotBlank() },
            events = request.events.takeIf { it.isNotBlank() },
            status = request.status
        )
        webhookRepository.findById(hook.id)!!.let {
            result.id = it.id; result.name = it.name; result.url = it.url
            result.events = it.events; result.status = it.status; result.createdAt = DtoMappers.epoch(it.createdAt)
        }
    }
}

@Service
class DeleteWebhookCommandHandler(private val webhookRepository: WebhookRepository) :
    CommandHandlerBase<DeleteWebhookCommand, EmptyResult>() {

    override fun validate(command: DeleteWebhookCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: DeleteWebhookCommand, result: EmptyResult) {
        webhookRepository.delete(command.id)
    }
}

@Service
class ListWebhookDeliveriesCommandHandler(private val webhookRepository: WebhookRepository) :
    CommandHandlerBase<ListWebhookDeliveriesCommand, WebhookDeliveryListResult>() {

    override fun validate(command: ListWebhookDeliveriesCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: ListWebhookDeliveriesCommand, result: WebhookDeliveryListResult) {
        result.list = webhookRepository.listDeliveries(command.webhookId, 100).map { row ->
            WebhookDeliveryResult().apply {
                id = row["id"] as Long
                webhookId = row["webhookId"] as Long
                event = row["event"] as String
                payload = row["payload"] as String?
                respCode = row["respCode"] as Int?
                success = (row["success"] as Int) == 1
                error = row["error"] as String?
                createdAt = DtoMappers.epoch(row["createdAt"] as? java.time.LocalDateTime)
            }
        }.toMutableList()
    }
}

// ==================== API Key ====================

@Service
class ListApiKeysCommandHandler(private val apiKeyRepository: ApiKeyRepository) :
    CommandHandlerBase<ListApiKeysCommand, ApiKeyListResult>() {

    override fun validate(command: ListApiKeysCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: ListApiKeysCommand, result: ApiKeyListResult) {
        result.list = apiKeyRepository.listAll().map { record ->
            ApiKeyResult().apply {
                id = record.id
                name = record.name
                keyPrefix = record.keyPrefix
                status = record.status
                lastUsedAt = DtoMappers.epoch(record.lastUsedAt)
                createdAt = DtoMappers.epoch(record.createdAt)
            }
        }.toMutableList()
    }
}

@Service
class CreateApiKeyCommandHandler(
    private val apiKeyService: tech.eflink.wiki.app.service.ApiKeyService,
    private val operationLogService: tech.eflink.wiki.app.service.OperationLogService
) : CommandHandlerBase<CreateApiKeyCommand, ApiKeyCreatedResult>() {

    override fun validate(command: CreateApiKeyCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
        require(command.request.name.isNotBlank()) { "名称不能为空" }
    }

    override fun handle(command: CreateApiKeyCommand, result: ApiKeyCreatedResult) {
        val (id, apiKey) = apiKeyService.generate(command.request.name.trim(), AuthContext.currentUserId())
        operationLogService.log("apikey.create", "apikey", id, "创建开放API密钥：${command.request.name}")
        result.id = id
        result.name = command.request.name.trim()
        result.apiKey = apiKey
    }
}

@Service
class DeleteApiKeyCommandHandler(private val apiKeyRepository: ApiKeyRepository) :
    CommandHandlerBase<DeleteApiKeyCommand, EmptyResult>() {

    override fun validate(command: DeleteApiKeyCommand) {
        tech.eflink.wiki.app.impl.admin.handler.requireSystemAdmin()
    }

    override fun handle(command: DeleteApiKeyCommand, result: EmptyResult) {
        apiKeyRepository.delete(command.id)
    }
}

// ==================== 开放 API（X-API-Key 只读） ====================

@Service
class ListOpenSpacesCommandHandler(
    private val spaceRepository: SpaceRepository,
    private val nodeRepository: NodeRepository
) : CommandHandlerBase<tech.eflink.wiki.contract.open.ListOpenSpacesCommand, tech.eflink.wiki.contract.open.OpenSpaceListResult>() {

    override fun handle(command: tech.eflink.wiki.contract.open.ListOpenSpacesCommand, result: tech.eflink.wiki.contract.open.OpenSpaceListResult) {
        result.list = spaceRepository.listVisible(0L, true).map { row ->
            tech.eflink.wiki.contract.open.OpenSpaceResult().apply {
                id = row.space.id
                name = row.space.name
                description = row.space.description
                nodeCount = nodeRepository.countBySpace(row.space.id)
                updatedAt = DtoMappers.epoch(row.space.updatedAt)
            }
        }.toMutableList()
    }
}

@Service
class GetOpenTreeCommandHandler(private val nodeRepository: NodeRepository) :
    CommandHandlerBase<tech.eflink.wiki.contract.open.GetOpenTreeCommand, tech.eflink.wiki.contract.open.OpenTreeResult>() {

    override fun handle(command: tech.eflink.wiki.contract.open.GetOpenTreeCommand, result: tech.eflink.wiki.contract.open.OpenTreeResult) {
        result.spaceId = command.spaceId
        val nodes = nodeRepository.listBySpace(command.spaceId)
        val byId = nodes.associateBy { it.id }
        val treeById = LinkedHashMap<Long, tech.eflink.wiki.contract.open.OpenTreeNodeResult>()
        nodes.forEach { treeById[it.id] = tech.eflink.wiki.contract.open.OpenTreeNodeResult().apply {
            id = it.id; parentId = it.parentId; title = it.title
        } }
        nodes.forEach { node ->
            val treeNode = treeById.getValue(node.id)
            val parent = if (node.parentId == 0L) null else byId[node.parentId]
            if (node.parentId == 0L || parent == null) result.nodes.add(treeNode)
            else treeById.getValue(node.parentId).children.add(treeNode)
        }
    }
}

@Service
class GetOpenNodeCommandHandler(
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository
) : CommandHandlerBase<tech.eflink.wiki.contract.open.GetOpenNodeCommand, tech.eflink.wiki.contract.open.OpenNodeResult>() {

    override fun handle(command: tech.eflink.wiki.contract.open.GetOpenNodeCommand, result: tech.eflink.wiki.contract.open.OpenNodeResult) {
        val node = nodeRepository.findById(command.nodeId) ?: throw ValidateException(406, "页面不存在")
        val version = node.currentVersionId?.let { versionRepository.findById(it) }
            ?: throw ValidateException(406, "页面尚未发布")
        result.apply {
            id = node.id
            spaceId = node.spaceId
            title = version.title
            versionNo = version.versionNo
            content = version.content
            publishedAt = DtoMappers.epoch(version.publishedAt)
        }
    }
}

@Service
class OpenSearchCommandHandler(
    private val searchPort: tech.eflink.wiki.core.search.SearchPort,
    private val nodeRepository: NodeRepository,
    private val spaceRepository: SpaceRepository
) : CommandHandlerBase<tech.eflink.wiki.contract.open.OpenSearchCommand, tech.eflink.wiki.contract.open.OpenSearchListResult>() {

    override fun validate(command: tech.eflink.wiki.contract.open.OpenSearchCommand) {
        require(command.keyword.isNotBlank()) { "请输入搜索关键字" }
    }

    override fun handle(command: tech.eflink.wiki.contract.open.OpenSearchCommand, result: tech.eflink.wiki.contract.open.OpenSearchListResult) {
        val limit = (command.limit ?: 20).coerceIn(1, 50)
        val nodeIds = searchPort.searchNodeIds(command.keyword.trim(), limit * 3)
        val spaceNames = spaceRepository.listVisible(0L, true).associate { it.space.id to it.space.name }
        result.list = nodeIds.mapNotNull { nodeRepository.findById(it) }
            .filter { spaceNames.containsKey(it.spaceId) }
            .take(limit)
            .map { node ->
                tech.eflink.wiki.contract.open.OpenSearchItemResult().apply {
                    nodeId = node.id
                    spaceId = node.spaceId
                    spaceName = spaceNames[node.spaceId] ?: ""
                    title = node.title
                    updatedAt = DtoMappers.epoch(node.updatedAt)
                }
            }.toMutableList()
    }
}
