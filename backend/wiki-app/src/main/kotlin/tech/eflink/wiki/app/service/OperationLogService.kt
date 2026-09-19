package tech.eflink.wiki.app.service

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import tech.eflink.wiki.core.mdc.MdcContext
import tech.eflink.wiki.store.repository.OperationLogRepository

/** 操作审计：调用线程采集身份，异步落库，失败不影响主流程 */
@Service
class OperationLogService(private val repository: OperationLogRepository) {

    private val logger = LoggerFactory.getLogger(OperationLogService::class.java)

    fun log(action: String, targetType: String? = null, targetId: Any? = null, detail: String? = null) {
        // MDC 是 ThreadLocal，必须在本线程取出身份后再交给异步线程
        val userId = MdcContext.getUserId() ?: return
        doWrite(
            userId = userId,
            username = MdcContext.getName() ?: "",
            action = action,
            targetType = targetType,
            targetId = targetId?.toString(),
            detail = detail,
            ip = MdcContext.getIpAddress()
        )
    }

    /** 登录等白名单接口（拦截器未写入 MDC）使用显式身份 */
    fun logFor(
        userId: Long,
        username: String,
        action: String,
        targetType: String? = null,
        targetId: Any? = null,
        detail: String? = null
    ) = doWrite(userId, username, action, targetType, targetId?.toString(), detail, MdcContext.getIpAddress())

    @Async
    fun doWrite(
        userId: Long,
        username: String,
        action: String,
        targetType: String?,
        targetId: String?,
        detail: String?,
        ip: String?
    ) {
        try {
            repository.insert(userId, username, action, targetType, targetId, detail, ip)
        } catch (ex: Exception) {
            logger.warn("审计日志写入失败: {}", ex.message)
        }
    }
}
