package tech.eflink.wiki.app.config

import jakarta.servlet.Filter
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ClassPathResource
import org.springframework.core.io.Resource
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.servlet.resource.ResourceResolver
import org.springframework.web.servlet.resource.ResourceResolverChain
import java.io.File

/** MVC 装配：登录拦截器（只拦 /api 前缀）+ 开放API密钥拦截器 + 本地上传目录静态映射 + 前端单页应用回退 */
@Configuration
class WebMvcConfig(
    private val loginInterceptor: LoginInterceptor,
    private val apiKeyInterceptor: ApiKeyInterceptor,
    private val routeWhiteList: RouteWhiteList,
    private val wikiProperties: WikiProperties
) : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(loginInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns(routeWhiteList.whitelist)
        // 开放接口走独立的 API-Key 鉴权
        registry.addInterceptor(apiKeyInterceptor)
            .addPathPatterns("/open/v1/**")
    }

    override fun addCorsMappings(registry: CorsRegistry) {
        val origins = wikiProperties.cors.origins.filter { it.isNotBlank() }
        if (origins.isEmpty()) return
        val originArr = origins.toTypedArray()
        registry.addMapping("/api/**")
            .allowedOrigins(*originArr)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600)
        registry.addMapping("/uploads/**")
            .allowedOrigins(*originArr)
            .allowedMethods("GET", "HEAD", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600)
        registry.addMapping("/open/v1/**")
            .allowedOrigins(*originArr)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600)
    }

    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        // 上传文件静态映射
        val dir = File(wikiProperties.storage.localDir).absolutePath
        registry.addResourceHandler("/uploads/**")
            .addResourceLocations("file:$dir/")

        // 前端静态资源 + SPA 回退（深度路由统一回 index.html）
        registry.addResourceHandler("/**")
            .addResourceLocations("classpath:/static/")
            .resourceChain(true)
            .addResolver(SpaFallbackResolver())
    }

    /** index.html 禁止缓存：assets 带内容 hash 可长缓存，入口页必须每次回源，否则升级后用户拿旧入口 */
    @org.springframework.context.annotation.Bean
    fun indexNoCacheFilter(): jakarta.servlet.Filter {
        return jakarta.servlet.Filter { request, response, chain ->
            val uri = (request as HttpServletRequest).requestURI
            if (uri == "/" || uri == "/index.html" || uri == "/version.json") {
                (response as HttpServletResponse).setHeader("Cache-Control", "no-cache, must-revalidate")
            }
            chain.doFilter(request, response)
        }
    }
}

/**
 * SPA 回退解析器：静态资源存在则返回；否则对"无扩展名"的页面路径回退 index.html。
 * /api、/uploads 前缀与带扩展名的资源不回退（由 404 处理器返回 JSON 错误）。
 */
class SpaFallbackResolver : ResourceResolver {

    private val index = ClassPathResource("/static/index.html")

    override fun resolveResource(
        request: HttpServletRequest?,
        requestPath: String,
        locations: MutableList<out Resource>,
        chain: ResourceResolverChain
    ): Resource? {
        chain.resolveResource(request, requestPath, locations)?.let { return it }
        return if (shouldFallback(requestPath) && index.exists()) index else null
    }

    override fun resolveUrlPath(
        resourcePath: String,
        locations: MutableList<out Resource>,
        chain: ResourceResolverChain
    ): String? = chain.resolveUrlPath(resourcePath, locations)

    private fun shouldFallback(path: String): Boolean {
        if (path == "/api" || path.startsWith("/api/")) return false
        if (path == "/uploads" || path.startsWith("/uploads/")) return false
        return !path.substringAfterLast('/').contains('.')
    }
}
