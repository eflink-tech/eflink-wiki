package tech.eflink.wiki.core.mdc

import jakarta.servlet.http.HttpServletRequest
import org.slf4j.MDC
import java.util.UUID

/** 日志/请求上下文：拦截器写入用户身份，业务层读取 */
object MdcContext {

    object Keys {
        const val REQUEST_ID = "requestId"
        const val USER_ID = "userId"
        const val NAME = "name"
        const val USER_ROLE = "userRole"
        const val IP_ADDRESS = "ipAddress"
        const val REQUEST_PATH = "requestPath"
        const val REQUEST_METHOD = "requestMethod"
    }

    fun generateRequestId(): String = UUID.randomUUID().toString().replace("-", "").substring(0, 16)

    fun setRequestId(requestId: String = generateRequestId()) = MDC.put(Keys.REQUEST_ID, requestId)

    fun setUserId(userId: String?) = if (userId != null) MDC.put(Keys.USER_ID, userId) else MDC.remove(Keys.USER_ID)

    fun getUserId(): Long? = MDC.get(Keys.USER_ID)?.toLongOrNull()

    fun setName(username: String?) = if (username != null) MDC.put(Keys.NAME, username) else MDC.remove(Keys.NAME)

    fun getName(): String? = MDC.get(Keys.NAME)

    fun setUserRole(role: String?) = if (role != null) MDC.put(Keys.USER_ROLE, role) else MDC.remove(Keys.USER_ROLE)

    fun getUserRole(): Int? = MDC.get(Keys.USER_ROLE)?.toIntOrNull()

    fun setIpAddress(ipAddress: String?) =
        if (ipAddress != null) MDC.put(Keys.IP_ADDRESS, ipAddress) else MDC.remove(Keys.IP_ADDRESS)

    fun getIpAddress(): String? = MDC.get(Keys.IP_ADDRESS)

    fun setRequestPath(path: String?) =
        if (path != null) MDC.put(Keys.REQUEST_PATH, path) else MDC.remove(Keys.REQUEST_PATH)

    fun getRequestPath(): String? = MDC.get(Keys.REQUEST_PATH)

    fun setRequestMethod(method: String?) =
        if (method != null) MDC.put(Keys.REQUEST_METHOD, method) else MDC.remove(Keys.REQUEST_METHOD)

    fun clear() = MDC.clear()

    /** 获取客户端真实 IP（含代理场景） */
    fun getClientIpAddress(request: HttpServletRequest): String {
        var ip = request.getHeader("X-Forwarded-For")
        if (ip.isNullOrBlank() || "unknown".equals(ip, ignoreCase = true)) {
            ip = request.getHeader("Proxy-Client-IP")
        }
        if (ip.isNullOrBlank() || "unknown".equals(ip, ignoreCase = true)) {
            ip = request.remoteAddr
        }
        if (!ip.isNullOrBlank() && ip.contains(",")) {
            ip = ip.split(",")[0].trim()
        }
        return ip ?: "unknown"
    }
}
