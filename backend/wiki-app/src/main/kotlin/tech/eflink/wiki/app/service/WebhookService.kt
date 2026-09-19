package tech.eflink.wiki.app.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import tech.eflink.wiki.store.repository.WebhookRepository
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.util.Base64

/** Webhook 事件推送：HMAC-SHA256 签名、异步投递、投递记录 */
@Service
class WebhookService(
    private val repository: WebhookRepository
) {

    private val logger = LoggerFactory.getLogger(WebhookService::class.java)
    private val objectMapper = ObjectMapper()
    private val restClient: RestClient = RestClient.builder()
        .defaultHeaders { headers -> headers.contentType = MediaType.APPLICATION_JSON }
        .build()

    /** 页面发布等事件入口：payload 为任意可序列化结构 */
    fun dispatch(event: String, payload: Map<String, Any?>) {
        val hooks = repository.findActiveByEvent(event)
        if (hooks.isEmpty()) return
        val body = objectMapper.writeValueAsString(mapOf("event" to event, "data" to payload))
        hooks.forEach { hook ->
            deliverAsync(hook.id, hook.url, hook.secret, event, body)
        }
    }

    @Async
    fun deliverAsync(webhookId: Long, url: String, secret: String, event: String, body: String) {
        try {
            val signature = hmacSha256(secret, body)
            val deliveryId = UUID.randomUUID().toString()
            val resp = restClient.post()
                .uri(url)
                .header("X-Wiki-Event", event)
                .header("X-Wiki-Signature", signature)
                .header("X-Wiki-Delivery", deliveryId)
                .body(body)
                .retrieve()
                .toBodilessEntity()
            repository.recordDelivery(webhookId, event, body, resp.statusCode.value(), true, null)
        } catch (ex: Exception) {
            logger.warn("Webhook 投递失败: {} -> {}", event, ex.message)
            repository.recordDelivery(webhookId, event, body, null, false, ex.message)
        }
    }

    /** 接收方可用同样算法验证：HMAC_SHA256(secret, 原始请求体) 的 base64 */
    fun hmacSha256(secret: String, body: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return Base64.getEncoder().encodeToString(mac.doFinal(body.toByteArray(Charsets.UTF_8)))
    }
}
