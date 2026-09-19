package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.wiki.handler.CreateNodeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteNodeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetDraftCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetPageCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetVersionCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListTrashCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListVersionsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.PublishNodeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.RestoreNodeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.RestoreVersionCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.SaveDraftCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UpdateNodeCommandHandler
import tech.eflink.wiki.contract.wiki.CreateNodeCommand
import tech.eflink.wiki.contract.wiki.CreateNodeRequest
import tech.eflink.wiki.contract.wiki.DeleteNodeCommand
import tech.eflink.wiki.contract.wiki.DraftResult
import tech.eflink.wiki.contract.wiki.DraftSaveResult
import tech.eflink.wiki.contract.wiki.GetDraftCommand
import tech.eflink.wiki.contract.wiki.GetPageCommand
import tech.eflink.wiki.contract.wiki.GetVersionCommand
import tech.eflink.wiki.contract.wiki.ListTrashCommand
import tech.eflink.wiki.contract.wiki.ListVersionsCommand
import tech.eflink.wiki.contract.wiki.NodeRestfulService
import tech.eflink.wiki.contract.wiki.NodeResult
import tech.eflink.wiki.contract.wiki.PageResult
import tech.eflink.wiki.contract.wiki.PublishNodeCommand
import tech.eflink.wiki.contract.wiki.PublishRequest
import tech.eflink.wiki.contract.wiki.PublishResult
import tech.eflink.wiki.contract.wiki.RestoreNodeCommand
import tech.eflink.wiki.contract.wiki.RestoreVersionCommand
import tech.eflink.wiki.contract.wiki.SaveDraftCommand
import tech.eflink.wiki.contract.wiki.SaveDraftRequest
import tech.eflink.wiki.contract.wiki.TrashListResult
import tech.eflink.wiki.contract.wiki.UpdateNodeCommand
import tech.eflink.wiki.contract.wiki.UpdateNodeRequest
import tech.eflink.wiki.contract.wiki.VersionListResult
import tech.eflink.wiki.contract.wiki.VersionResult
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/wiki/nodes")
class NodeRestfulServiceImpl : NodeRestfulService {

    override fun create(@RequestBody request: CreateNodeRequest): Result<NodeResult> =
        CreateNodeCommand(request).executeWithResult()

    override fun update(@PathVariable id: Long, @RequestBody request: UpdateNodeRequest): Result<NodeResult> =
        UpdateNodeCommand(id, request).executeWithResult()

    override fun delete(@PathVariable id: Long, @RequestParam(defaultValue = "false") purge: Boolean): Result<EmptyResult> =
        DeleteNodeCommand(id, purge).executeWithResult()

    override fun restore(@PathVariable id: Long): Result<EmptyResult> =
        RestoreNodeCommand(id).executeWithResult()

    override fun recycle(@PathVariable spaceId: Long): Result<TrashListResult> =
        ListTrashCommand(spaceId).executeWithResult()

    override fun page(@PathVariable id: Long): Result<PageResult> =
        GetPageCommand(id).executeWithResult()

    override fun draft(@PathVariable id: Long): Result<DraftResult> =
        GetDraftCommand(id).executeWithResult()

    override fun saveDraft(@PathVariable id: Long, @RequestBody request: SaveDraftRequest): Result<DraftSaveResult> =
        SaveDraftCommand(id, request).executeWithResult()

    override fun deleteDraft(@PathVariable id: Long): Result<EmptyResult> =
        tech.eflink.wiki.contract.wiki.DeleteDraftCommand(id).executeWithResult()

    override fun publish(@PathVariable id: Long, @RequestBody request: PublishRequest): Result<PublishResult> =
        PublishNodeCommand(id, request).executeWithResult()

    override fun versions(@PathVariable id: Long): Result<VersionListResult> =
        ListVersionsCommand(id).executeWithResult()

    override fun version(@PathVariable id: Long, @PathVariable versionNo: Int): Result<VersionResult> =
        GetVersionCommand(id, versionNo).executeWithResult()

    override fun restoreVersion(@PathVariable id: Long, @PathVariable versionNo: Int): Result<DraftResult> =
        RestoreVersionCommand(id, versionNo).executeWithResult()
}
