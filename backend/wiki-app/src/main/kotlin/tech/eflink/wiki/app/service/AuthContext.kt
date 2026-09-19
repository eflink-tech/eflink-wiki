package tech.eflink.wiki.app.service

import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.mdc.MdcContext

/** 业务层读取登录上下文（LoginInterceptor 写入 MDC） */
object AuthContext {

    /** 当前登录用户 ID，未登录抛 401 */
    fun currentUserId(): Long =
        MdcContext.getUserId() ?: throw TokenValidationException(406, "未登录或登录已过期")

    /** 当前登录用户名 */
    fun currentUsername(): String =
        MdcContext.getName() ?: throw TokenValidationException(406, "未登录或登录已过期")

    /** 当前登录用户系统角色：1 管理员 2 普通用户 */
    fun currentUserRole(): Int? = MdcContext.getUserRole()

    /** 是否系统管理员 */
    fun isSystemAdmin(): Boolean = currentUserRole() == 1
}
