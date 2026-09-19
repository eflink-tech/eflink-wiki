package tech.eflink.wiki.contract.admin

import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam

// ==================== License ====================

/** 授权状态 */
class LicenseStateResult : DataTransferObjectBase() {
    var present: Boolean = false
    var valid: Boolean = false
    var reason: String? = null
    var licensee: String? = null
    var expiresAt: Long? = null
    var maxUsers: Int? = null
    var usedUsers: Long = 0
    var features: MutableList<String> = mutableListOf()
}

class GetLicenseStateCommand : CommandObjectBase<LicenseStateResult>()

class UploadLicenseCommand(val content: String?, val file: MultipartFile?) : CommandObjectBase<LicenseStateResult>()

@Tag(name = "管理后台-License授权", description = "查看授权状态 / 上传授权文件（Ed25519 验签）")
interface AdminLicenseRestfulService {

    @Operation(summary = "授权状态", description = "是否存在授权、是否有效、到期时间、用户数上限与已用数、功能开关")
    @GetMapping
    fun state(): Result<LicenseStateResult>

    @Operation(summary = "上传授权", description = "上传授权文件（license.txt 原文），验签通过后生效；二选一传 content 或 file")
    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE])
    fun upload(
        @RequestParam(value = "content", required = false) content: String?,
        @RequestParam(value = "file", required = false) file: MultipartFile?
    ): Result<LicenseStateResult>
}

// ==================== Webhook ====================

class WebhookResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var url: String = ""
    var events: String = "*"
    var status: Int = 1
    var createdAt: Long? = null
}

class WebhookListResult : DataTransferObjectBase() {
    var list: MutableList<WebhookResult> = mutableListOf()
}

data class SaveWebhookRequest(
    val name: String = "",
    val url: String = "",
    val secret: String? = null,
    val events: String = "*",
    val status: Int? = null
)

class WebhookDeliveryResult : DataTransferObjectBase() {
    var id: Long = 0
    var webhookId: Long = 0
    var event: String = ""
    var payload: String? = null
    var respCode: Int? = null
    var success: Boolean = false
    var error: String? = null
    var createdAt: Long? = null
}

class WebhookDeliveryListResult : DataTransferObjectBase() {
    var list: MutableList<WebhookDeliveryResult> = mutableListOf()
}

class ListWebhooksCommand : CommandObjectBase<WebhookListResult>()

class CreateWebhookCommand(val request: SaveWebhookRequest) : CommandObjectBase<WebhookResult>()

class UpdateWebhookCommand(val id: Long, val request: SaveWebhookRequest) : CommandObjectBase<WebhookResult>()

class DeleteWebhookCommand(val id: Long) : CommandObjectBase<tech.eflink.wiki.core.communication.EmptyResult>()

class ListWebhookDeliveriesCommand(val webhookId: Long?) :
    CommandObjectBase<WebhookDeliveryListResult>()

@Tag(name = "管理后台-Webhook", description = "事件推送订阅管理（页面发布等事件，HMAC-SHA256 签名）")
interface AdminWebhookRestfulService {

    @Operation(summary = "订阅列表")
    @GetMapping
    fun list(): Result<WebhookListResult>

    @Operation(summary = "创建订阅", description = "secret 不填则自动生成；events 逗号分隔，* 为全部")
    @PostMapping
    fun create(@RequestBody request: SaveWebhookRequest): Result<WebhookResult>

    @Operation(summary = "更新订阅", description = "secret 为空表示不修改")
    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @RequestBody request: SaveWebhookRequest
    ): Result<WebhookResult>

    @Operation(summary = "删除订阅")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): Result<tech.eflink.wiki.core.communication.EmptyResult>

    @Operation(summary = "投递记录", description = "最近 100 条，可按订阅过滤")
    @GetMapping("/deliveries")
    fun deliveries(
        @RequestParam(required = false) webhookId: Long?
    ): Result<WebhookDeliveryListResult>
}

// ==================== API Key ====================

class ApiKeyResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var keyPrefix: String = ""
    var status: Int = 1
    var lastUsedAt: Long? = null
    var createdAt: Long? = null
}

class ApiKeyListResult : DataTransferObjectBase() {
    var list: MutableList<ApiKeyResult> = mutableListOf()
}

class ApiKeyCreatedResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    /** 完整密钥仅创建时返回一次 */
    var apiKey: String = ""
}

data class CreateApiKeyRequest(val name: String = "")

class ListApiKeysCommand : CommandObjectBase<ApiKeyListResult>()

class CreateApiKeyCommand(val request: CreateApiKeyRequest) : CommandObjectBase<ApiKeyCreatedResult>()

class DeleteApiKeyCommand(val id: Long) : CommandObjectBase<tech.eflink.wiki.core.communication.EmptyResult>()

@Tag(name = "管理后台-开放API密钥", description = "供外部系统调用只读开放接口 /open/v1/**（请求头 X-API-Key）")
interface AdminApiKeyRestfulService {

    @Operation(summary = "密钥列表", description = "只显示前缀，不显示完整密钥")
    @GetMapping
    fun list(): Result<ApiKeyListResult>

    @Operation(summary = "创建密钥", description = "完整密钥仅在创建响应中返回一次")
    @PostMapping
    fun create(@RequestBody request: CreateApiKeyRequest): Result<ApiKeyCreatedResult>

    @Operation(summary = "删除密钥")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): Result<tech.eflink.wiki.core.communication.EmptyResult>
}
