package tech.eflink.wiki.app.service.storage

import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.config.WikiProperties
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * 同源文件代理：前端在线预览组件（docx/xlsx/pptx 渲染库）需要 fetch 文件字节，
 * 而文件在七牛（跨域 + 私有签名 URL），浏览器直连会被 CORS 拦截。
 * 由后端代为拉取并流式回传，前端请求同源 /api/file-proxy 即可。
 *
 * 安全边界：
 * - 挂在 /api 前缀下，经 LoginInterceptor 需登录后才能使用；
 * - 目标 URL 严格白名单：host 必须等于所配置的七牛存储域名，杜绝 SSRF。
 */
@RestController
@RequestMapping("/api/file-proxy")
class FileProxyController(private val wikiProperties: WikiProperties) {

    private val logger = LoggerFactory.getLogger(FileProxyController::class.java)

    @GetMapping
    fun proxy(@RequestParam("url") rawUrl: String, response: HttpServletResponse) {
        val allowedHosts = buildSet {
            wikiProperties.storage.qiniu.domain.takeIf { it.isNotBlank() }?.let {
                add(runCatching { URI(it.trim()).host?.lowercase() }.getOrNull() ?: "")
            }
        }.filter { it.isNotBlank() }.toSet()

        val uri = runCatching { URI(rawUrl) }.getOrNull()
        val scheme = uri?.scheme?.lowercase()
        val host = uri?.host?.lowercase()
        if (uri == null || (scheme != "http" && scheme != "https") || host == null || host !in allowedHosts) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "url 不在允许的存储域内")
            return
        }

        val conn = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                logger.warn("文件代理上游返回 {}: host={}", code, host)
                response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "存储端返回 $code")
                return
            }
            response.contentType = conn.contentType ?: "application/octet-stream"
            conn.contentLengthLong.takeIf { it >= 0 }?.let { response.setContentLengthLong(it) }
            // 内容不可变（key 含 uuid），允许浏览器私有缓存，减少重复回源
            response.setHeader("Cache-Control", "private, max-age=3600")
            conn.inputStream.use { input ->
                response.outputStream.use { output -> input.copyTo(output, 64 * 1024) }
            }
        } catch (e: Exception) {
            logger.warn("文件代理拉取失败: host={}", host, e)
            if (!response.isCommitted) response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "文件拉取失败")
        } finally {
            conn.disconnect()
        }
    }
}
