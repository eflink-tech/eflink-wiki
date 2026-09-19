package tech.eflink.wiki.app.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.LicenseRepository
import tech.eflink.wiki.store.repository.UserRepository
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Base64

/** 授权状态 */
data class LicenseState(
    val present: Boolean,
    val valid: Boolean,
    val reason: String?,
    val licensee: String?,
    val expiresAt: Long?,
    val maxUsers: Int?,
    val usedUsers: Long,
    val features: List<String>
)

/**
 * License 校验：Ed25519 验签（公钥内置配置），授权文件由厂商签发、管理后台上传。
 * 到期不影响已有功能的继续使用（仅提示），用户数上限在创建账号时强制执行。
 */
@Service
class LicenseService(
    private val repository: LicenseRepository,
    private val userRepository: UserRepository,
    private val props: WikiProperties
) {

    private val logger = LoggerFactory.getLogger(LicenseService::class.java)
    private val objectMapper = ObjectMapper()

    /** 解析并验证授权文件内容（签名 + 到期）；失败抛业务异常 */
    fun verifyAndParse(content: String): JsonNode {
        val node = try {
            objectMapper.readTree(content)
        } catch (ex: Exception) {
            throw ValidateException(406, "授权文件格式错误（需要 JSON）")
        }
        val signature = node.get("signature")?.asText().orEmpty()
        if (signature.isBlank()) throw ValidateException(406, "授权文件缺少签名")
        val payload = listOf(
            node.get("product")?.asText() ?: "",
            node.get("licensee")?.asText() ?: "",
            node.get("expiresAt")?.asText() ?: "",
            node.get("maxUsers")?.asText() ?: "null",
            node.get("features")?.asText() ?: ""
        ).joinToString("|")
        val publicKey = props.license.publicKey
        if (publicKey.isBlank()) throw ValidateException(406, "产品未配置验签公钥（wiki.license.public-key）")
        val verified = try {
            val keyBytes = Base64.getDecoder().decode(publicKey)
            val publicKeyObj = KeyFactory.getInstance("Ed25519")
                .generatePublic(X509EncodedKeySpec(keyBytes))
            val verifier = Signature.getInstance("Ed25519")
            verifier.initVerify(publicKeyObj)
            verifier.update(payload.toByteArray(Charsets.UTF_8))
            verifier.verify(Base64.getDecoder().decode(signature))
        } catch (ex: Exception) {
            logger.warn("License 验签异常: {}", ex.message)
            false
        }
        if (!verified) throw ValidateException(406, "授权文件签名无效")
        if (node.get("product")?.asText() != "eflink-wiki") throw ValidateException(406, "授权文件产品不匹配")
        return node
    }

    /** 保存验证通过的授权 */
    fun save(content: String, node: JsonNode, updatedBy: Long) {
        val expiresAt = node.get("expiresAt")?.asText()?.let {
            runCatching { LocalDateTime.ofInstant(java.time.Instant.parse(it), ZoneId.systemDefault()) }.getOrNull()
        }
        repository.save(
            content = content,
            licensee = node.get("licensee")?.asText().orEmpty(),
            expiresAt = expiresAt,
            maxUsers = node.get("maxUsers")?.takeIf { !it.isNull && it.isNumber }?.intValue(),
            features = node.get("features")?.asText().orEmpty(),
            updatedBy = updatedBy
        )
    }

    /** 当前授权状态（过期/无效给出原因但不抛异常，供页面展示） */
    fun state(): LicenseState {
        val record = repository.findLatest()
            ?: return LicenseState(false, false, null, null, null, null, userRepository.countAll(), emptyList())
        val expired = record.expiresAt?.let { it.isBefore(LocalDateTime.now()) } ?: false
        val signatureOk = runCatching { verifyAndParse(record.content); true }.getOrDefault(false)
        val valid = signatureOk && !expired
        return LicenseState(
            present = true,
            valid = valid,
            reason = when {
                !signatureOk -> "签名无效"
                expired -> "授权已过期"
                else -> null
            },
            licensee = record.licensee,
            expiresAt = record.expiresAt?.atZone(ZoneId.systemDefault())?.toInstant()?.toEpochMilli(),
            maxUsers = record.maxUsers,
            usedUsers = userRepository.countAll(),
            features = record.features.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        )
    }

    /** 创建账号前强制校验用户数上限（仅存在有效授权且配置了上限时生效） */
    fun assertCanCreateUser() {
        val record = repository.findLatest() ?: return
        val expired = record.expiresAt?.let { it.isBefore(LocalDateTime.now()) } ?: false
        val maxUsers = record.maxUsers ?: return
        if (!expired && userRepository.countAll() >= maxUsers) {
            throw ValidateException(406, "已达授权用户数上限（$maxUsers 人），请联系厂商扩容授权")
        }
    }
}
