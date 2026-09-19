package tech.eflink.wiki.app.config

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.FieldError
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.servlet.NoHandlerFoundException
import org.springframework.web.servlet.resource.NoResourceFoundException
import tech.eflink.wiki.core.dto.Result
import tech.eflink.wiki.core.exception.MyfException
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.exception.ValidateException

/** 全局异常处理：统一返回 Result 信封（与存量 eflink-backend 约定一致） */
@RestControllerAdvice
class GlobalExceptionHandler {

    private val logger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    @ExceptionHandler(ValidateException::class)
    fun handleValidateException(ex: ValidateException): ResponseEntity<Result<*>> {
        logger.warn("参数验证失败: {}", ex.message)
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).body(
            Result.error<Nothing>(status = ex.code, error = "Not Acceptable", message = ex.message ?: "参数验证失败")
        )
    }

    @ExceptionHandler(TokenValidationException::class)
    fun handleTokenValidationException(ex: TokenValidationException): ResponseEntity<Result<*>> {
        logger.warn("认证失败: {}", ex.message)
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
            Result.error<Nothing>(status = ex.code, error = "Unauthorized", message = ex.message ?: "认证失败")
        )
    }

    @ExceptionHandler(MyfException::class)
    fun handleMyfException(ex: MyfException): ResponseEntity<Result<*>> {
        logger.warn("业务异常: {}", ex.message)
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).body(
            Result.error<Nothing>(status = 406, error = "Not Acceptable", message = ex.message ?: "业务处理失败")
        )
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleMethodArgumentNotValidException(ex: MethodArgumentNotValidException): ResponseEntity<Result<*>> {
        val errors = ex.bindingResult.allErrors.joinToString("; ") { error ->
            val fieldName = (error as? FieldError)?.field ?: "unknown"
            "$fieldName: ${error.defaultMessage ?: "验证失败"}"
        }
        logger.warn("参数校验失败: {}", errors)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            Result.error<Nothing>(status = 400, error = "Bad Request", message = errors)
        )
    }

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleIllegalArgumentException(ex: IllegalArgumentException): ResponseEntity<Result<*>> {
        logger.warn("非法参数: {}", ex.message)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            Result.error<Nothing>(status = 400, error = "Bad Request", message = ex.message ?: "参数错误")
        )
    }

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun handleHttpMessageNotReadableException(ex: HttpMessageNotReadableException): ResponseEntity<Result<*>> {
        logger.warn("请求体解析失败: {}", ex.message)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            Result.error<Nothing>(status = 400, error = "Bad Request", message = "请求体格式错误")
        )
    }

    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun handleMaxUploadSize(ex: MaxUploadSizeExceededException): ResponseEntity<Result<*>> {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            Result.error<Nothing>(status = 400, error = "Bad Request", message = "文件大小超出限制")
        )
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException::class)
    fun handleMethodNotSupported(ex: HttpRequestMethodNotSupportedException): ResponseEntity<Result<*>> {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(
            Result.error<Nothing>(status = 405, error = "Method Not Allowed", message = "不支持的请求方法: ${ex.method}")
        )
    }

    @ExceptionHandler(NoHandlerFoundException::class)
    fun handleNoHandlerFound(ex: NoHandlerFoundException): ResponseEntity<Result<*>> {
        logger.warn("接口不存在: {}", ex.requestURL)
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            Result.error<Nothing>(status = 404, error = "Not Found", message = "接口不存在: ${ex.requestURL}")
        )
    }

    /** 静态资源未命中（含未匹配到的 API 路径）→ 404 JSON */
    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNoResourceFound(ex: NoResourceFoundException): ResponseEntity<Result<*>> {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            Result.error<Nothing>(status = 404, error = "Not Found", message = "资源不存在: ${ex.resourcePath}")
        )
    }

    @ExceptionHandler(Exception::class)
    fun handleDefault(ex: Exception): ResponseEntity<Result<*>> {
        logger.error("系统异常", ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
            Result.error<Nothing>(status = 500, error = "Internal Server Error", message = ex.message ?: "系统内部错误")
        )
    }
}
