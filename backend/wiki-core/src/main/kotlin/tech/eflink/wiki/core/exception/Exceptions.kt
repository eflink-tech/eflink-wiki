package tech.eflink.wiki.core.exception

/** 业务异常基类 */
open class MyfException(message: String) : RuntimeException(message)

/** 参数校验异常 → 全局处理器映射 HTTP 406 */
class ValidateException(val code: Int, message: String) : MyfException(message)

/** 认证异常 → 全局处理器映射 HTTP 401 */
class TokenValidationException(val code: Int, message: String) : MyfException(message)
