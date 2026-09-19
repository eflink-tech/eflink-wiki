package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.wiki.handler.CreateApiKeyCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.CreateWebhookCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteApiKeyCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteWebhookCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetLicenseStateCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetOpenNodeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetOpenTreeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListApiKeysCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListOpenSpacesCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListWebhookDeliveriesCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListWebhooksCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.OpenSearchCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UpdateWebhookCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UploadLicenseCommandHandler
import tech.eflink.wiki.contract.admin.AdminApiKeyRestfulService
import tech.eflink.wiki.contract.admin.AdminLicenseRestfulService
import tech.eflink.wiki.contract.admin.AdminWebhookRestfulService
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
import tech.eflink.wiki.contract.admin.WebhookListResult
import tech.eflink.wiki.contract.admin.WebhookResult
import tech.eflink.wiki.contract.open.GetOpenNodeCommand
import tech.eflink.wiki.contract.open.GetOpenTreeCommand
import tech.eflink.wiki.contract.open.ListOpenSpacesCommand
import tech.eflink.wiki.contract.open.OpenNodeResult
import tech.eflink.wiki.contract.open.OpenRestfulService
import tech.eflink.wiki.contract.open.OpenSearchCommand
import tech.eflink.wiki.contract.open.OpenSearchListResult
import tech.eflink.wiki.contract.open.OpenSpaceListResult
import tech.eflink.wiki.contract.open.OpenTreeResult
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/admin/license")
class AdminLicenseRestfulServiceImpl : AdminLicenseRestfulService {

    override fun state(): Result<LicenseStateResult> = GetLicenseStateCommand().executeWithResult()

    override fun upload(content: String?, file: org.springframework.web.multipart.MultipartFile?): Result<LicenseStateResult> =
        UploadLicenseCommand(content, file).executeWithResult()
}

@RestController
@RequestMapping("/api/admin/webhooks")
class AdminWebhookRestfulServiceImpl : AdminWebhookRestfulService {

    override fun list(): Result<WebhookListResult> = ListWebhooksCommand().executeWithResult()

    override fun create(@RequestBody request: SaveWebhookRequest): Result<WebhookResult> =
        CreateWebhookCommand(request).executeWithResult()

    override fun update(@PathVariable id: Long, @RequestBody request: SaveWebhookRequest): Result<WebhookResult> =
        UpdateWebhookCommand(id, request).executeWithResult()

    override fun delete(@PathVariable id: Long): Result<EmptyResult> =
        DeleteWebhookCommand(id).executeWithResult()

    override fun deliveries(@RequestParam(required = false) webhookId: Long?): Result<WebhookDeliveryListResult> =
        ListWebhookDeliveriesCommand(webhookId).executeWithResult()
}

@RestController
@RequestMapping("/api/admin/apikeys")
class AdminApiKeyRestfulServiceImpl : AdminApiKeyRestfulService {

    override fun list(): Result<ApiKeyListResult> = ListApiKeysCommand().executeWithResult()

    override fun create(@RequestBody request: CreateApiKeyRequest): Result<ApiKeyCreatedResult> =
        CreateApiKeyCommand(request).executeWithResult()

    override fun delete(@PathVariable id: Long): Result<EmptyResult> =
        DeleteApiKeyCommand(id).executeWithResult()
}

/** 只读开放接口（ApiKeyInterceptor 校验 X-API-Key，不走 JWT 登录拦截器） */
@RestController
@RequestMapping("/open/v1")
class OpenRestfulServiceImpl : OpenRestfulService {

    override fun spaces(): Result<OpenSpaceListResult> = ListOpenSpacesCommand().executeWithResult()

    override fun tree(@PathVariable spaceId: Long): Result<OpenTreeResult> =
        GetOpenTreeCommand(spaceId).executeWithResult()

    override fun node(@PathVariable nodeId: Long): Result<OpenNodeResult> =
        GetOpenNodeCommand(nodeId).executeWithResult()

    override fun search(@RequestParam q: String, @RequestParam(required = false) limit: Int?): Result<OpenSearchListResult> =
        OpenSearchCommand(q, limit).executeWithResult()
}
