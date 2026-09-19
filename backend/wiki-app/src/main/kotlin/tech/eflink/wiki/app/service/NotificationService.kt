package tech.eflink.wiki.app.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.store.repository.NotificationRepository
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * 站内通知服务：通知落库（站内信，永远开启）+ 钉钉/飞书/企业微信机器人推送（配置 webhook 后自动启用）。
 *
 * 触发点由业务 handler 调用；IM 推送按（收件人+类型+页面）短窗口去重，
 * 避免连续保存/多条评论刷屏。推送失败只记日志，不影响主流程。
 */
@Service
class NotificationService(
    private val notificationRepository: NotificationRepository,
    private val props: WikiProperties,
    private val objectMapper: ObjectMapper
) {

    private val logger = LoggerFactory.getLogger(NotificationService::class.java)

    companion object {
        const val TYPE_PAGE_COMMENTED: Int = 1
        const val TYPE_COMMENT_REPLIED: Int = 2
        const val TYPE_MENTIONED: Int = 3
        /** IM 推送去重窗口（毫秒） */
        private const val IM_DEDUPE_WINDOW_MS = 60_000L
    }

    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    /** IM 推送去重：key = user:type:nodeId -> last push epoch ms */
    private val recentPushes = ConcurrentHashMap<String, Long>()

    /** 页面收到新评论（通知页面作者） */
    fun notifyPageCommented(recipientId: Long, actorName: String, pageTitle: String, spaceId: Long, nodeId: Long, commentId: Long) {
        val title = "$actorName 评论了《$pageTitle》"
        createAndPush(recipientId, TYPE_PAGE_COMMENTED, title, spaceId, nodeId, commentId)
    }

    /** 评论被回复（通知父评论作者） */
    fun notifyCommentReplied(recipientId: Long, actorName: String, pageTitle: String, spaceId: Long, nodeId: Long, commentId: Long) {
        val title = "$actorName 回复了你在《$pageTitle》的评论"
        createAndPush(recipientId, TYPE_COMMENT_REPLIED, title, spaceId, nodeId, commentId)
    }

    /** 被 @ 提及（发布差量触发） */
    fun notifyMentioned(recipientId: Long, actorName: String, pageTitle: String, spaceId: Long, nodeId: Long) {
        val title = "$actorName 在《$pageTitle》中提到了你"
        createAndPush(recipientId, TYPE_MENTIONED, title, spaceId, nodeId, 0)
    }

    private fun createAndPush(recipientId: Long, type: Int, title: String, spaceId: Long, nodeId: Long, commentId: Long) {
        if (recipientId <= 0) return
        val payload = objectMapper.writeValueAsString(
            linkedMapOf("spaceId" to spaceId, "nodeId" to nodeId, "commentId" to commentId)
        )
        runCatching { notificationRepository.create(recipientId, type, title.take(490), payload) }
            .onFailure { logger.warn("通知落库失败: user={}", recipientId, it) }
        pushToIm(recipientId, type, title, spaceId, nodeId)
    }

    /** 钉钉/飞书/企业微信机器人推送（配置了哪个推哪个，多渠道并行；短窗口去重，失败不影响主流程） */
    private fun pushToIm(recipientId: Long, type: Int, title: String, spaceId: Long, nodeId: Long) {
        val ding = props.notify.dingtalk.webhook
        val feishu = props.notify.feishu.webhook
        val wecom = props.notify.wecom.webhook
        if (ding.isBlank() && feishu.isBlank() && wecom.isBlank()) return

        val dedupeKey = "$recipientId:$type:$nodeId"
        val now = System.currentTimeMillis()
        val last = recentPushes[dedupeKey] ?: 0
        if (now - last < IM_DEDUPE_WINDOW_MS) return
        recentPushes[dedupeKey] = now
        // 防止 map 无限增长
        if (recentPushes.size > 10_000) recentPushes.clear()

        val base = props.notify.baseUrl.trimEnd('/')
        val text = if (base.isBlank()) title else "$title\n$base/app/space/$spaceId/page/$nodeId"

        if (ding.isNotBlank()) runCatching { postDingTalk(ding, title, text) }
            .onFailure { logger.warn("钉钉机器人推送失败: user={}", recipientId, it) }
        if (feishu.isNotBlank()) runCatching { postFeishu(feishu, text) }
            .onFailure { logger.warn("飞书机器人推送失败: user={}", recipientId, it) }
        if (wecom.isNotBlank()) runCatching { postWeCom(wecom, text) }
            .onFailure { logger.warn("企业微信机器人推送失败: user={}", recipientId, it) }
    }

    /** 钉钉自定义机器人 markdown 消息；配置了加签 secret 则附加 timestamp+sign */
    private fun postDingTalk(webhook: String, title: String, text: String) {
        var url = webhook
        val secret = props.notify.dingtalk.secret
        if (secret.isNotBlank()) {
            val ts = System.currentTimeMillis()
            val stringToSign = "$ts\n$secret"
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
            val sign = URLEncoder.encode(
                Base64.getEncoder().encodeToString(mac.doFinal(stringToSign.toByteArray())),
                Charsets.UTF_8
            )
            url = "$webhook&timestamp=$ts&sign=$sign"
        }
        val body = objectMapper.writeValueAsString(
            mapOf("msgtype" to "markdown", "markdown" to mapOf("title" to title, "text" to text))
        )
        post(url, body)
    }

    /** 飞书自定义机器人文本消息（含签名时需 timestamp+sign 字段，这里支持无签名的默认配置） */
    private fun postFeishu(webhook: String, text: String) {
        val body = objectMapper.writeValueAsString(
            mapOf("msg_type" to "text", "content" to mapOf("text" to text))
        )
        post(webhook, body)
    }

    /**
     * 企业微信群机器人 markdown 消息。
     * 与钉钉/飞书不同：无论成败 HTTP 恒返回 200，须检查响应 JSON 的 errcode（0 为成功）。
     */
    private fun postWeCom(webhook: String, text: String) {
        val body = objectMapper.writeValueAsString(
            mapOf("msgtype" to "markdown", "markdown" to mapOf("content" to text))
        )
        val respBody = post(webhook, body)
        val errcode = runCatching {
            objectMapper.readTree(respBody)?.get("errcode")?.asInt(-1)
        }.getOrDefault(-1)
        if (errcode != 0) {
            throw IllegalStateException("企业微信 webhook errcode=$errcode: ${respBody.take(200)}")
        }
    }

    private fun post(url: String, jsonBody: String): String {
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
            .build()
        val resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (resp.statusCode() !in 200..299) {
            throw IllegalStateException("IM webhook 返回 ${resp.statusCode()}: ${resp.body().take(200)}")
        }
        return resp.body()
    }
}
