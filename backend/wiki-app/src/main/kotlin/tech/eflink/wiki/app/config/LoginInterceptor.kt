package tech.eflink.wiki.app.config

import io.jsonwebtoken.JwtException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.mdc.MdcContext

/** JWT 登录拦截器：解析并校验 access token，把用户身份写入 MDC（业务层经 AuthContext 读取） */
@Component
class LoginInterceptor(
    private val jwtService: JwtService
) : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        MdcContext.setRequestId()
        MdcContext.setRequestPath(request.requestURI)
        MdcContext.setRequestMethod(request.method)
        MdcContext.setIpAddress(MdcContext.getClientIpAddress(request))

        if (request.method.equals("OPTIONS", ignoreCase = true)) return true

        var token = request.getHeader("Authorization")
        if (token?.startsWith("Bearer ") == true) {
            token = token.substring(7)
        }
        if (token.isNullOrBlank()) {
            throw TokenValidationException(406, "未登录")
        }

        val claims = try {
            jwtService.parse(token)
        } catch (ex: JwtException) {
            throw TokenValidationException(406, "登录已过期，请重新登录")
        } catch (ex: IllegalArgumentException) {
            throw TokenValidationException(406, "登录凭证无效")
        }

        MdcContext.setUserId(claims.subject)
        MdcContext.setName(claims.get("username", String::class.java))
        val role = claims.get("role", Integer::class.java)
        MdcContext.setUserRole(role?.toString())
        return true
    }

    override fun afterCompletion(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any,
        ex: Exception?
    ) {
        MDC.clear()
    }
}
