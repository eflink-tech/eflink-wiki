package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.impl.wiki.handler.ListFavoritesCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListMyDraftsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.SearchCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ToggleFavoriteCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UploadFileCommandHandler
import tech.eflink.wiki.contract.wiki.DraftItemListResult
import tech.eflink.wiki.contract.wiki.FavoriteListResult
import tech.eflink.wiki.contract.wiki.FavoriteToggleResult
import tech.eflink.wiki.contract.wiki.ListFavoritesCommand
import tech.eflink.wiki.contract.wiki.ListMyDraftsCommand
import tech.eflink.wiki.contract.wiki.ListRecentOpensCommand
import tech.eflink.wiki.contract.wiki.RecordRecentOpenCommand
import tech.eflink.wiki.contract.wiki.RecordRecentOpenRequest
import tech.eflink.wiki.contract.wiki.RecentOpenListResult
import tech.eflink.wiki.contract.wiki.SearchCommand
import tech.eflink.wiki.contract.wiki.SearchListResult
import tech.eflink.wiki.contract.wiki.ToggleFavoriteCommand
import tech.eflink.wiki.contract.wiki.ToggleFavoriteRequest
import tech.eflink.wiki.contract.wiki.UploadFileCommand
import tech.eflink.wiki.contract.wiki.UploadResult
import tech.eflink.wiki.contract.wiki.WikiMiscRestfulService
import tech.eflink.wiki.contract.wiki.UploadRestfulService
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/wiki")
class WikiMiscRestfulServiceImpl : WikiMiscRestfulService {

    override fun favorites(): Result<FavoriteListResult> = ListFavoritesCommand().executeWithResult()

    override fun toggleFavorite(@RequestBody request: ToggleFavoriteRequest): Result<FavoriteToggleResult> =
        ToggleFavoriteCommand(request.nodeId).executeWithResult()

    override fun search(@RequestParam q: String, @RequestParam(required = false) spaceId: Long?): Result<SearchListResult> =
        SearchCommand(q, spaceId).executeWithResult()

    override fun drafts(): Result<DraftItemListResult> = ListMyDraftsCommand().executeWithResult()

    override fun recentOpens(): Result<RecentOpenListResult> = ListRecentOpensCommand().executeWithResult()

    override fun recordRecentOpen(@RequestBody request: RecordRecentOpenRequest): Result<tech.eflink.wiki.core.communication.EmptyResult> =
        RecordRecentOpenCommand(request.nodeId).executeWithResult()
}

@RestController
@RequestMapping("/api/upload")
class UploadRestfulServiceImpl : UploadRestfulService {

    override fun upload(@RequestPart("file") file: MultipartFile): Result<UploadResult> =
        UploadFileCommand(file).executeWithResult()
}
