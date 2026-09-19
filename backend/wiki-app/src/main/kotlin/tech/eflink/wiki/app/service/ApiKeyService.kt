package tech.eflink.wiki.app.service

import org.springframework.stereotype.Service
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.ApiKeyRepository
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** 开放 API 密钥：格式 wk_<6位前缀>.<32位随机段>，库中只存前缀 + 整体散列 */
@Service
class ApiKeyService(private val repository: ApiKeyRepository) {

    private val random = SecureRandom()

    fun generate(name: String, createdBy: Long): Pair<Long, String> {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        val raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)   // 32 chars
        val prefix = "wk" + raw.take(6)
        val apiKey = "$prefix.$raw"
        val id = repository.create(name, prefix, sha256(apiKey), createdBy)
        return id to apiKey
    }

    /** 校验请求密钥：前缀定位 + 常量时间散列比较；有效则刷新最近使用时间 */
    fun verify(apiKey: String): Boolean {
        val prefix = apiKey.substringBefore('.', "").takeIf { it.startsWith("wk") } ?: return false
        val record = repository.findByPrefix(prefix) ?: return false
        val ok = MessageDigest.isEqual(record.keyHash.toByteArray(), sha256(apiKey).toByteArray())
        if (ok) repository.touchUsed(record.id)
        return ok
    }

    fun requireValid(apiKey: String?) {
        if (apiKey.isNullOrBlank() || !verify(apiKey)) {
            throw tech.eflink.wiki.core.exception.TokenValidationException(401, "无效的 API Key")
        }
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
