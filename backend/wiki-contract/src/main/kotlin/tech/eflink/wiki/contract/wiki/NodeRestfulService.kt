package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam

@Tag(name = "知识库-页面", description = "页面树的节点操作、草稿自动保存、发布与版本、回收站")
interface NodeRestfulService {

    @Operation(summary = "创建页面", description = "在指定空间/父页面下新建页面（编辑者及以上权限），同时创建本人空白草稿")
    @PostMapping
    fun create(@RequestBody request: CreateNodeRequest): Result<NodeResult>

    @Operation(summary = "更新页面", description = "改名 / 移动（parentId）/ 排序（sort）；移动不可到自身或其子孙节点")
    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @RequestBody request: UpdateNodeRequest
    ): Result<NodeResult>

    @Operation(summary = "删除页面", description = "软删自身与全部子孙节点进回收站；purge=true 时彻底删除（仅空间管理员）")
    @DeleteMapping("/{id}")
    fun delete(
        @PathVariable id: Long,
        @Parameter(description = "是否彻底删除") @RequestParam(defaultValue = "false") purge: Boolean
    ): Result<EmptyResult>

    @Operation(summary = "恢复页面", description = "从回收站恢复；若父页面仍在回收站则挂到空间根")
    @PostMapping("/{id}/restore")
    fun restore(@PathVariable id: Long): Result<EmptyResult>

    @Operation(summary = "回收站列表", description = "仅空间管理员可访问")
    @GetMapping("/recycle/{spaceId}")
    fun recycle(@PathVariable spaceId: Long): Result<TrashListResult>

    @Operation(summary = "读取已发布页面", description = "viewer 可读；未发布时 content 为 null；每次阅读累计浏览计数")
    @GetMapping("/{id}/page")
    fun page(@PathVariable id: Long): Result<PageResult>

    @Operation(summary = "读取我的草稿", description = "草稿按（页面，用户）隔离；currentVersionNo 为当前已发布版本号")
    @GetMapping("/{id}/draft")
    fun draft(@PathVariable id: Long): Result<DraftResult>

    @Operation(summary = "保存草稿", description = "编辑器 2s 防抖自动保存；content 为 ProseMirror JSON 字符串")
    @PutMapping("/{id}/draft")
    fun saveDraft(
        @PathVariable id: Long,
        @RequestBody request: SaveDraftRequest
    ): Result<DraftSaveResult>

    @Operation(summary = "放弃我的草稿", description = "删除本人该页面的草稿（放弃未发布修改用）")
    @DeleteMapping("/{id}/draft")
    fun deleteDraft(@PathVariable id: Long): Result<tech.eflink.wiki.core.communication.EmptyResult>

    @Operation(summary = "发布页面", description = "把我的草稿生成新的不可变版本并设为当前版本，清空该页面全部草稿")
    @PostMapping("/{id}/publish")
    fun publish(
        @PathVariable id: Long,
        @RequestBody request: PublishRequest
    ): Result<PublishResult>

    @Operation(summary = "版本列表")
    @GetMapping("/{id}/versions")
    fun versions(@PathVariable id: Long): Result<VersionListResult>

    @Operation(summary = "版本详情", description = "读取指定版本快照正文")
    @GetMapping("/{id}/versions/{versionNo}")
    fun version(
        @PathVariable id: Long,
        @PathVariable versionNo: Int
    ): Result<VersionResult>

    @Operation(summary = "回滚到版本", description = "把指定版本快照写入我的草稿（不直接覆盖线上版本），确认后重新发布即回滚")
    @PostMapping("/{id}/versions/{versionNo}/restore")
    fun restoreVersion(
        @PathVariable id: Long,
        @PathVariable versionNo: Int
    ): Result<DraftResult>
}
