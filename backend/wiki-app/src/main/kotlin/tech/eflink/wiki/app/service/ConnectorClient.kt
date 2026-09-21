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

/** 对方系统兑换回来的账号身份快照 */
data class ConnectorIdentity(
    val externalId: String,
    val username: String,
    /** 对方系统的姓名/显示名；缺省回退 username */
    val displayName: String?,
    val email: String?,
    /** 发起登录时生成的 state，对方系统原样回传供服务端比对 */
    val state: String
)

/**
 * 外部系统关联登录（connector）客户端：服务端对服务端兑换一次性票据。
 * 兑换通道在对方系统侧以共享密钥鉴权，票据一次性、短期有效（60 秒）。
 * 按 provider 取对应 connector 配置（baseUrl / exchangePath / secret）。
 */
@Service
class ConnectorClient(private val props: WikiProperties) {

    private val logger = LoggerFactory.getLogger(ConnectorClient::class.java)
    private val objectMapper = ObjectMapper()
    private val restClient = RestClient.builder()
        .requestFactory(
            SimpleClientHttpRequestFactory().apply {
                setConnectTimeout(5000)
                setReadTimeout(10000)
            }
        )
        .build()

    fun exchange(provider: String, ticket: String): ConnectorIdentity {
        val conf = props.auth.connector(provider)
            ?: throw ValidateException(406, "关联登录通道未启用")
        val body = try {
            restClient.post()
                .uri("${conf.baseUrl.trimEnd('/')}${conf.exchangePath}")
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapOf("ticket" to ticket, "secret" to conf.secret))
                .retrieve()
                .body(String::class.java)
        } catch (e: Exception) {
            logger.warn("connector[{}] 票据兑换请求失败: {}", provider, e.message)
            throw ValidateException(406, "授权服务暂不可用，请稍后重试")
        } ?: throw ValidateException(406, "票据无效或已过期，请重新发起登录")

        val node = try {
            objectMapper.readTree(body)
        } catch (_: Exception) {
            throw ValidateException(406, "授权服务响应异常，请稍后重试")
        }
        if (node.path("status").asInt(-1) != 0) {
            val message = node.path("message").asText("")
            throw ValidateException(406, message.ifBlank { "票据无效或已过期，请重新发起登录" })
        }
        val data: JsonNode = node.path("data")
        // externalId 兼容数字与字符串（asText 对数值节点同样返回字面量）
        val externalId = data.path("userId").asText("").trim()
        val username = data.path("username").asText("").trim()
        if (externalId.isEmpty() || externalId == "0" || username.isEmpty()) {
            throw ValidateException(406, "授权服务返回的账号信息不完整")
        }
        val displayName = data.path("displayName").asText("").trim().takeIf { it.isNotEmpty() }
        return ConnectorIdentity(
            externalId = externalId,
            username = username,
            displayName = displayName,
            email = data.path("email").asText("").trim().takeIf { it.isNotEmpty() },
            state = data.path("state").asText("")
        )
    }
}
