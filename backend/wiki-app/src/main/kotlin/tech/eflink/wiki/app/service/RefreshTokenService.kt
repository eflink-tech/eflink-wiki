package tech.eflink.wiki.app.service

import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.store.repository.RefreshTokenRepository
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.LocalDateTime
import java.util.Base64

/** 刷新令牌：随机原文发给客户端，库中只存 SHA-256 散列；支持轮换与整人吊销 */
@Service
class RefreshTokenService(
    private val repository: RefreshTokenRepository,
    private val props: WikiProperties
) {

    private val random = SecureRandom()

    /** 签发新刷新令牌，返回原文（仅此一次可见） */
    fun issue(userId: Long): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        val raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        repository.insert(userId, sha256(raw), LocalDateTime.now().plusSeconds(props.jwt.refreshTtlSeconds))
        return raw
    }

    /** 校验并取回令牌记录（未吊销且未过期），无效抛业务异常 */
    fun consume(raw: String): tech.eflink.wiki.database.tables.records.RefreshTokenRecord {
        if (raw.isBlank()) throw ValidateException(406, "缺少刷新令牌")
        return repository.findValidByHash(sha256(raw))
            ?: throw ValidateException(406, "登录已过期，请重新登录")
    }

    /** 吊销（轮换时调用） */
    fun revoke(raw: String) {
        repository.findByHash(sha256(raw))?.let { repository.revokeById(it.id) }
    }

    /** 吊销某用户全部刷新令牌（改密码后强制重新登录） */
    fun revokeAllForUser(userId: Long) = repository.revokeAllByUser(userId)

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
