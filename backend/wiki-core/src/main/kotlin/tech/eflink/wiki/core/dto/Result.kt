package tech.eflink.wiki.core.dto

/**
 * 统一响应结果封装（与存量 eflink-backend 约定一致：status=0 成功）
 */
data class Result<T>(
    val timestamp: Long = System.currentTimeMillis(),
    val status: Int,
    val data: T? = null,
    val error: String? = null,
    val message: String? = null,
    val path: String = ""
) {
    companion object {
        /** 成功响应 */
        fun <T> success(data: T): Result<T> = Result(status = 0, data = data)

        /** 失败响应 */
        fun <T> error(status: Int, error: String, message: String, path: String = ""): Result<T> = Result(
            status = status,
            error = error,
            message = message,
            path = path
        )
    }
}
