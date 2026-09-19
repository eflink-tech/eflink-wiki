package tech.eflink.wiki.app.impl.wiki.restful

import io.jsonwebtoken.JwtException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.config.CollabProperties
import tech.eflink.wiki.app.impl.wiki.handler.WikiGuard
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.store.repository.DocStateRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.UserRepository
import java.util.Base64

/**
 * collab-server 专用内部接口（/api/internal/collab 路径族，登录拦截白名单放行，由共享密钥自行鉴权）：
 * - auth：校验前端带来的 JWT + 页面空间角色 → 返回用户身份与只读标志（查看者只读连接）
 * - doc：Yjs 二进制快照的读/写（collab-server onLoadDocument / onStoreDocument 调用）
 *
 * 注意：属基础设施通道，不走业务 Result 信封。
 */
@RestController
class CollabInternalController(
    private val collabProperties: CollabProperties,
    private val jwtService: JwtService,
    private val nodeRepository: NodeRepository,
    private val spaceRepository: SpaceRepository,
    private val userRepository: UserRepository,
    private val docStateRepository: DocStateRepository,
    private val guard: WikiGuard
) {

    private fun requireInternalKey(key: String?): ResponseEntity<Map<String, String>>? {
        if (collabProperties.internalKey.isBlank() || key != collabProperties.internalKey) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to "invalid internal key"))
        }
        return null
    }

    data class CollabAuthRequest(val token: String = "", val nodeId: Long = 0)
    data class CollabAuthResult(val userId: Long, val username: String, val displayName: String, val readOnly: Boolean)
    data class CollabDocState(val state: String?)

    @PostMapping("/api/internal/collab/auth")
    fun auth(
        @RequestHeader("X-Internal-Key") internalKey: String?,
        @RequestBody request: CollabAuthRequest
    ): ResponseEntity<Any> {
        requireInternalKey(internalKey)?.let { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(it) }
        val claims = try {
            jwtService.parse(request.token)
        } catch (e: JwtException) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to "invalid token"))
        }
        val userId = claims.subject.toLongOrNull()
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to "invalid token"))
        val node = nodeRepository.findById(request.nodeId)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to "page not found"))
        val space = spaceRepository.findById(node.spaceId)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to "space not found"))
        val role = guard.resolveRole(space, userId)
        if (role <= 0) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to "no access"))
        }
        val displayName = userRepository.findById(userId)?.displayName ?: claims.get("username", String::class.java) ?: ""
        return ResponseEntity.ok(
            CollabAuthResult(
                userId = userId,
                username = claims.get("username", String::class.java) ?: "",
                displayName = displayName,
                // 查看者（role 3）只读连接；管理员/编辑者可写
                readOnly = role >= 3
            )
        )
    }

    @GetMapping("/api/internal/collab/doc")
    fun getState(
        @RequestHeader("X-Internal-Key") internalKey: String?,
        @RequestParam nodeId: Long
    ): ResponseEntity<Any> {
        requireInternalKey(internalKey)?.let { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(it) }
        val state = docStateRepository.findState(nodeId)
        return ResponseEntity.ok(
            CollabDocState(state = state?.let { Base64.getEncoder().encodeToString(it) })
        )
    }

    data class CollabDocSaveRequest(val nodeId: Long = 0, val state: String = "")

    @PostMapping("/api/internal/collab/doc")
    fun saveState(
        @RequestHeader("X-Internal-Key") internalKey: String?,
        @RequestBody request: CollabDocSaveRequest
    ): ResponseEntity<Any> {
        requireInternalKey(internalKey)?.let { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(it) }
        val bytes = try {
            Base64.getDecoder().decode(request.state)
        } catch (e: IllegalArgumentException) {
            return ResponseEntity.badRequest().body(mapOf("error" to "invalid base64"))
        }
        if (request.nodeId <= 0 || bytes.isEmpty()) {
            return ResponseEntity.badRequest().body(mapOf("error" to "invalid payload"))
        }
        docStateRepository.upsert(request.nodeId, bytes)
        return ResponseEntity.ok(mapOf("ok" to true))
    }
}
