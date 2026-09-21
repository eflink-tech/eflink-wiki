package tech.eflink.wiki.app.service

import org.springframework.stereotype.Service
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * 撞名冲突待授权暂存：票据兑换成功后把外部身份暂存 5 分钟，
 * 供"输密授权绑定"接口一次性消费（wiki 单实例部署，进程内存即可，重启后用户重新发起登录）。
 */
@Service
class ConnectorPendingStore {

    data class Pending(
        val provider: String,
        val externalId: String,
        val username: String,
        val email: String?,
        val expiresAt: Long,
        var attempts: Int = 0
    )

    private val entries = ConcurrentHashMap<String, Pending>()

    fun put(provider: String, externalId: String, username: String, email: String?): String {
        purgeExpired()
        if (entries.size >= MAX_ENTRIES) {
            // 容量兜底：极小概率并发洪峰，直接拒绝新请求而不是挤掉他人会话
            throw IllegalStateException("授权绑定服务繁忙，请稍后重试")
        }
        val token = UUID.randomUUID().toString().replace("-", "")
        entries[token] = Pending(provider, externalId, username, email, System.currentTimeMillis() + TTL_MILLIS)
        return token
    }

    /** 读取未过期的待授权记录；过期即清理 */
    fun peek(token: String): Pending? {
        val pending = entries[token] ?: return null
        if (pending.expiresAt < System.currentTimeMillis()) {
            entries.remove(token)
            return null
        }
        return pending
    }

    /** 消费成功（绑定完成）后销毁 */
    fun remove(token: String) {
        entries.remove(token)
    }

    /** 密码错误计数；超过重试次数则销毁，返回是否仍可重试 */
    fun recordFailure(token: String): Boolean {
        val pending = entries[token] ?: return false
        pending.attempts += 1
        if (pending.attempts >= MAX_ATTEMPTS) {
            entries.remove(token)
            return false
        }
        return true
    }

    private fun purgeExpired() {
        val now = System.currentTimeMillis()
        entries.entries.removeAll { it.value.expiresAt < now }
    }

    companion object {
        private const val TTL_MILLIS = 5 * 60 * 1000L
        private const val MAX_ENTRIES = 1024
        private const val MAX_ATTEMPTS = 5
    }
}
