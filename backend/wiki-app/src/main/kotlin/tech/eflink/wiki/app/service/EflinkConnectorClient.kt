package tech.eflink.wiki.app.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.core.exception.ValidateException

/** 主站兑换回来的账号身份快照 */
data class EflinkIdentity(
    val externalId: String,
    val username: String,
    val email: String?,
    /** 发起登录时生成的 state，主站原样回传供服务端比对 */
    val state: String
)

/**
 * eflink 主站关联登录客户端：服务端对服务端兑换一次性票据。
 * 兑换通道在 eflink-backend 侧以共享密钥鉴权，票据一次性、60 秒有效。
 */
@Service
class EflinkConnectorClient(private val props: WikiProperties) {

    private val logger = LoggerFactory.getLogger(EflinkConnectorClient::class.java)
    private val objectMapper = ObjectMapper()
    private val restClient = RestClient.builder()
        .requestFactory(
            SimpleClientHttpRequestFactory().apply {
                setConnectTimeout(5000)
                setReadTimeout(10000)
            }
        )
        .build()

    fun exchange(ticket: String): EflinkIdentity {
        val conf = props.auth.eflink
        val body = try {
            restClient.post()
                .uri("${conf.baseUrl.trimEnd('/')}/api/internal/connect/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapOf("ticket" to ticket, "secret" to conf.secret))
                .retrieve()
                .body(String::class.java)
        } catch (e: Exception) {
            logger.warn("eflink 票据兑换请求失败: {}", e.message)
            throw ValidateException(406, "主站服务暂不可用，请稍后重试")
        } ?: throw ValidateException(406, "票据无效或已过期，请重新发起登录")

        val node = try {
            objectMapper.readTree(body)
        } catch (_: Exception) {
            throw ValidateException(406, "主站响应异常，请稍后重试")
        }
        if (node.path("status").asInt(-1) != 0) {
            val message = node.path("message").asText("")
            throw ValidateException(406, message.ifBlank { "票据无效或已过期，请重新发起登录" })
        }
        val data: JsonNode = node.path("data")
        val userId = data.path("userId").asInt(0)
        val username = data.path("username").asText("").trim()
        if (userId <= 0 || username.isEmpty()) throw ValidateException(406, "主站返回的账号信息不完整")
        return EflinkIdentity(
            externalId = userId.toString(),
            username = username,
            email = data.path("email").asText("").trim().takeIf { it.isNotEmpty() },
            state = data.path("state").asText("")
        )
    }
}
