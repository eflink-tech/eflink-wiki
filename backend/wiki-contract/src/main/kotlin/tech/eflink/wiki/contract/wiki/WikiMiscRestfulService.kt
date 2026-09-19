package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam

@Tag(name = "知识库-收藏/搜索/草稿箱", description = "跨空间的收藏、全局搜索与我的草稿")
interface WikiMiscRestfulService {

    @Operation(summary = "我的收藏列表")
    @GetMapping("/favorites")
    fun favorites(): Result<FavoriteListResult>

    @Operation(summary = "收藏/取消收藏", description = "切换收藏状态，返回切换后是否已收藏")
    @PostMapping("/favorites")
    fun toggleFavorite(@RequestBody request: ToggleFavoriteRequest): Result<FavoriteToggleResult>

    @Operation(summary = "全局搜索", description = "按标题+已发布正文全文检索（MySQL ngram），可限定空间")
    @GetMapping("/search")
    fun search(
        @Parameter(description = "关键字") @RequestParam q: String,
        @Parameter(description = "限定空间ID") @RequestParam(required = false) spaceId: Long?
    ): Result<SearchListResult>

    @Operation(summary = "我的草稿箱", description = "跨空间的全部未发布草稿")
    @GetMapping("/drafts")
    fun drafts(): Result<DraftItemListResult>

    @Operation(summary = "我的最近打开页面", description = "按最近打开时间倒序，最多返回 10 条")
    @GetMapping("/recent-opens")
    fun recentOpens(): Result<RecentOpenListResult>

    @Operation(summary = "记录页面打开", description = "进入页面时调用；存在记录则刷新时间")
    @PostMapping("/recent-opens")
    fun recordRecentOpen(@RequestBody request: RecordRecentOpenRequest): Result<tech.eflink.wiki.core.communication.EmptyResult>
}

/** 记录打开页面请求 */
data class RecordRecentOpenRequest(val nodeId: Long = 0)

/** 收藏切换请求 */
data class ToggleFavoriteRequest(val nodeId: Long = 0)

@Tag(name = "上传", description = "图片/附件上传，落本地磁盘，返回 /uploads/ 相对 URL")
interface UploadRestfulService {

    @Operation(summary = "上传文件", description = "multipart 字段名 file；返回可直接访问的相对 URL")
    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(@org.springframework.web.bind.annotation.RequestPart("file") file: org.springframework.web.multipart.MultipartFile): Result<UploadResult>
}
