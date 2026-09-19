package tech.eflink.wiki.app.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import tech.eflink.wiki.app.service.ApiKeyService

/** 开放接口鉴权：X-API-Key 头（与 JWT 登录体系完全独立） */
@Component
class ApiKeyInterceptor(private val apiKeyService: ApiKeyService) : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        apiKeyService.requireValid(request.getHeader("X-API-Key"))
        return true
    }
}
