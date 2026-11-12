package tech.eflink.wiki.contract.wiki

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

/** 分享设置（编辑者及以上可见/可改） */
@Schema(description = "页面分享设置")
class ShareConfigResult : DataTransferObjectBase() {
    var enabled: Boolean = false
    var token: String? = null
    /** 0 任何人可读 / 1 登录用户可读 / 2 仅空间成员 */
    var access: Int = 0
    /** 过期时间毫秒；null 表示永久 */
    var expiresAt: Long? = null
    var createdAt: Long? = null
}

/** 保存分享设置请求 */
class SaveShareRequest {
    /** 0 任何人可读 / 1 登录用户可读 / 2 仅空间成员 */
    var access: Int = 0
    /** 有效天数：null/0 表示永久 */
    var expiresInDays: Int? = null
}

@Tag(name = "知识库-页面分享", description = "页面只读分享链接：公开 / 登录可读 / 仅空间成员，支持有效期与撤销")
interface ShareRestfulService {

    @Operation(summary = "读取分享设置", description = "空间查看者及以上可读；未开启时 enabled=false")
    @GetMapping("/{nodeId}")
    fun get(@PathVariable nodeId: Long): Result<ShareConfigResult>

    @Operation(summary = "保存分享设置", description = "空间编辑者及以上；重复保存会覆盖原设置（令牌保持不变）")
    @PutMapping("/{nodeId}")
    fun save(
        @PathVariable nodeId: Long,
        @RequestBody request: SaveShareRequest
    ): Result<ShareConfigResult>

    @Operation(summary = "撤销分享", description = "删除分享链接，原地址立即失效")
    @DeleteMapping("/{nodeId}")
    fun revoke(@PathVariable nodeId: Long): Result<EmptyResult>
}

/** 分享页内容（匿名可访问，按分享范围校验） */
@Schema(description = "分享页面内容")
class SharedPageResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var title: String = ""
    var content: String? = null
    var versionNo: Int? = null
    var publishedAt: Long? = null
    var publishedByName: String? = null
    var spaceName: String? = null
    var ownerName: String? = null
    /** 当前分享访问范围（前端提示用） */
    var access: Int = 0
    var expiresAt: Long? = null
}
