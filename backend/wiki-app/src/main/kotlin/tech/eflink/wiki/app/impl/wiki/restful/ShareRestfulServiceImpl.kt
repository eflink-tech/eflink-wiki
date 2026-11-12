package tech.eflink.wiki.app.impl.wiki.restful

import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.DtoMappers
import tech.eflink.wiki.app.impl.wiki.handler.WikiGuard
import tech.eflink.wiki.app.service.AuthContext
import tech.eflink.wiki.app.service.JwtService
import tech.eflink.wiki.contract.wiki.SaveShareRequest
import tech.eflink.wiki.contract.wiki.ShareConfigResult
import tech.eflink.wiki.contract.wiki.ShareRestfulService
import tech.eflink.wiki.contract.wiki.SharedPageResult
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import tech.eflink.wiki.core.exception.TokenValidationException
import tech.eflink.wiki.core.exception.ValidateException
import tech.eflink.wiki.database.tables.records.WikiShareLinkRecord
import tech.eflink.wiki.store.repository.MemberRepository
import tech.eflink.wiki.store.repository.NodeRepository
import tech.eflink.wiki.store.repository.ShareLinkRepository
import tech.eflink.wiki.store.repository.SpaceRepository
import tech.eflink.wiki.store.repository.UserGroupRepository
import tech.eflink.wiki.store.repository.UserRepository
import tech.eflink.wiki.store.repository.VersionRepository
import java.security.SecureRandom
import java.time.LocalDateTime

/** 页面分享设置：编辑者生成/修改/撤销分享链接 */
@RestController
@RequestMapping("/api/wiki/share")
class ShareRestfulServiceImpl(
    private val nodeRepository: NodeRepository,
    private val spaceRepository: SpaceRepository,
    private val shareRepository: ShareLinkRepository,
    private val guard: WikiGuard,
) : ShareRestfulService {

    private fun toResult(rec: WikiShareLinkRecord): ShareConfigResult =
        ShareConfigResult().apply {
            enabled = true
            token = rec.token
            access = rec.access
            expiresAt = DtoMappers.epoch(rec.expiresAt)
            createdAt = DtoMappers.epoch(rec.createdAt)
        }

    override fun get(nodeId: Long): Result<ShareConfigResult> {
        val node = nodeRepository.findById(nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 3)
        val rec = shareRepository.findByNode(node.id)
        return Result.success(
            if (rec == null || isExpired(rec.expiresAt)) ShareConfigResult() else toResult(rec),
        )
    }

    override fun save(nodeId: Long, request: SaveShareRequest): Result<ShareConfigResult> {
        val node = nodeRepository.findById(nodeId) ?: throw ValidateException(406, "页面不存在")
        val access = guard.requireSpaceRole(node.spaceId, 2)
        val scope = request.access.coerceIn(0, 2)
        val days = request.expiresInDays ?: 0
        val expiresAt = if (days > 0) LocalDateTime.now().plusDays(days.toLong()) else null
        val existing = shareRepository.findByNode(node.id)
        val token = existing?.token ?: newToken()
        val rec = shareRepository.upsert(node.id, node.spaceId, token, scope, access.userId, expiresAt)
        return Result.success(toResult(rec))
    }

    override fun revoke(nodeId: Long): Result<EmptyResult> {
        val node = nodeRepository.findById(nodeId) ?: throw ValidateException(406, "页面不存在")
        guard.requireSpaceRole(node.spaceId, 2)
        shareRepository.deleteByNode(node.id)
        return Result.success(EmptyResult())
    }

    private fun isExpired(at: LocalDateTime?): Boolean = at != null && at.isBefore(LocalDateTime.now())

    private fun newToken(): String {
        val bytes = ByteArray(24)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}

/**
 * 公开分享页：匿名可访问（白名单），按链接范围校验。
 * 不为 access=1/2 的请求单设登录接口，而是从 Authorization 头手动解析 JWT，
 * 这样同一个分享地址对未登录/已登录用户行为一致。
 */
@RestController
@RequestMapping("/api/public/share")
class PublicShareRestfulServiceImpl(
    private val shareRepository: ShareLinkRepository,
    private val nodeRepository: NodeRepository,
    private val versionRepository: VersionRepository,
    private val spaceRepository: SpaceRepository,
    private val userRepository: UserRepository,
    private val memberRepository: MemberRepository,
    private val userGroupRepository: UserGroupRepository,
    private val jwtService: JwtService,
) {

    @GetMapping("/{token}")
    fun page(
        @PathVariable token: String,
        request: HttpServletRequest,
    ): Result<SharedPageResult> {
        val link = shareRepository.findByToken(token) ?: throw ValidateException(404, "分享链接不存在或已撤销")
        if (link.expiresAt != null && link.expiresAt.isBefore(LocalDateTime.now())) {
            throw ValidateException(410, "分享链接已过期")
        }
        val node = nodeRepository.findById(link.nodeId) ?: throw ValidateException(404, "页面不存在")
        val viewer = resolveViewer(request)
        when (link.access) {
            0 -> {}
            1 -> if (viewer == null) throw TokenValidationException(401, "该分享仅登录用户可访问")
            else -> requireMember(link.spaceId, viewer ?: throw TokenValidationException(401, "该分享仅空间成员可访问"))
        }

        val space = spaceRepository.findById(node.spaceId)
        val version = node.currentVersionId?.let { versionRepository.findById(it) }
        return Result.success(
            SharedPageResult().apply {
                nodeId = node.id
                spaceId = node.spaceId
                title = node.title
                content = version?.content
                versionNo = version?.versionNo
                publishedAt = DtoMappers.epoch(version?.publishedAt)
                publishedByName = version?.let { userRepository.findById(it.publishedBy)?.displayName }
                spaceName = space?.name
                ownerName = space?.let { userRepository.findById(it.ownerId)?.displayName }
                access = link.access
                expiresAt = DtoMappers.epoch(link.expiresAt)
            },
        )
    }

    private data class Viewer(val userId: Long, val role: Int)

    /** 解析可选登录态：无 Authorization / 令牌无效一律视为匿名 */
    private fun resolveViewer(request: HttpServletRequest): Viewer? {
        val header = request.getHeader("Authorization") ?: return null
        if (!header.startsWith("Bearer ")) return null
        return try {
            val claims = jwtService.parse(header.removePrefix("Bearer ").trim())
            val userId = claims.subject?.toLongOrNull() ?: return null
            val user = userRepository.findById(userId) ?: return null
            if (user.status != 1) null else Viewer(userId, (claims["role"] as? Number)?.toInt() ?: user.role)
        } catch (_: Exception) {
            null
        }
    }

    /** 仅空间成员可读：所有者/系统管理员/直接成员/用户组授权均视为成员 */
    private fun requireMember(spaceId: Long, viewer: Viewer) {
        if (viewer.role == 1) return
        val space = spaceRepository.findById(spaceId) ?: throw ValidateException(404, "空间不存在")
        if (space.ownerId == viewer.userId) return
        if (memberRepository.findBySpaceAndUser(spaceId, viewer.userId) != null) return
        if (userGroupRepository.minRoleViaGroups(spaceId, viewer.userId) != null) return
        throw TokenValidationException(403, "该分享仅空间成员可访问")
    }
}
