package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.wiki.handler.ImportUsersCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListOperationsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.AddCommentCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteCommentCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetEmbedDataCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetTemplateCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListCommentsCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListTemplatesCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.SaveAsTemplateCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.SaveEmbedDataCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteTemplateCommandHandler
import tech.eflink.wiki.contract.admin.AdminOperationRestfulService
import tech.eflink.wiki.contract.admin.AdminUserRestfulService
import tech.eflink.wiki.contract.admin.ImportUsersCommand
import tech.eflink.wiki.contract.admin.ImportUsersResult
import tech.eflink.wiki.contract.admin.ListOperationsCommand
import tech.eflink.wiki.contract.admin.OperationListRequest
import tech.eflink.wiki.contract.admin.OperationPageResult
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.contract.admin.CreateUserCommand
import tech.eflink.wiki.contract.admin.CreateUserRequest
import tech.eflink.wiki.contract.admin.ListUsersCommand
import tech.eflink.wiki.contract.admin.UpdateUserCommand
import tech.eflink.wiki.contract.admin.UpdateUserRequest
import tech.eflink.wiki.contract.admin.UserListRequest
import tech.eflink.wiki.contract.admin.UserPageResult
import tech.eflink.wiki.contract.wiki.AddCommentCommand
import tech.eflink.wiki.contract.wiki.AddCommentRequest
import tech.eflink.wiki.contract.wiki.CommentListResult
import tech.eflink.wiki.contract.wiki.CommentResult
import tech.eflink.wiki.contract.wiki.CommentRestfulService
import tech.eflink.wiki.contract.wiki.DeleteCommentCommand
import tech.eflink.wiki.contract.wiki.DeleteTemplateCommand
import tech.eflink.wiki.contract.wiki.EmbedDataResult
import tech.eflink.wiki.contract.wiki.EmbedRestfulService
import tech.eflink.wiki.contract.wiki.GetEmbedDataCommand
import tech.eflink.wiki.contract.wiki.GetTemplateCommand
import tech.eflink.wiki.contract.wiki.ListCommentsCommand
import tech.eflink.wiki.contract.wiki.ListTemplatesCommand
import tech.eflink.wiki.contract.wiki.SaveAsTemplateCommand
import tech.eflink.wiki.contract.wiki.SaveEmbedDataCommand
import tech.eflink.wiki.contract.wiki.SaveEmbedRequest
import tech.eflink.wiki.contract.wiki.SaveTemplateRequest
import tech.eflink.wiki.contract.wiki.TemplateDetailResult
import tech.eflink.wiki.contract.wiki.TemplateListResult
import tech.eflink.wiki.contract.wiki.TemplateRestfulService
import tech.eflink.wiki.contract.wiki.TemplateResult
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/api/wiki/nodes")
class CommentRestfulServiceImpl : CommentRestfulService {

    override fun list(@PathVariable id: Long): Result<CommentListResult> =
        ListCommentsCommand(id).executeWithResult()

    override fun add(@PathVariable id: Long, @RequestBody request: AddCommentRequest): Result<CommentResult> =
        AddCommentCommand(id, request).executeWithResult()
}

@RestController
class CommentDeleteRestfulServiceImpl : tech.eflink.wiki.contract.wiki.CommentDeleteRestfulService {

    override fun delete(@PathVariable commentId: Long): Result<EmptyResult> =
        DeleteCommentCommand(commentId).executeWithResult()
}

@RestController
@RequestMapping("/api/wiki")
class EmbedRestfulServiceImpl : EmbedRestfulService {

    override fun get(@PathVariable nodeId: Long, @PathVariable embedId: String): Result<EmbedDataResult> =
        GetEmbedDataCommand(nodeId, embedId).executeWithResult()

    override fun save(
        @PathVariable nodeId: Long,
        @PathVariable embedId: String,
        @RequestBody request: SaveEmbedRequest
    ): Result<EmbedDataResult> = SaveEmbedDataCommand(nodeId, embedId, request).executeWithResult()
}

@RestController
@RequestMapping("/api/wiki")
class TemplateRestfulServiceImpl : TemplateRestfulService {

    override fun list(): Result<TemplateListResult> = ListTemplatesCommand().executeWithResult()

    override fun detail(@PathVariable id: Long): Result<TemplateDetailResult> =
        GetTemplateCommand(id).executeWithResult()

    override fun saveAsTemplate(
        @PathVariable nodeId: Long,
        @RequestBody request: SaveTemplateRequest
    ): Result<TemplateResult> = SaveAsTemplateCommand(nodeId, request).executeWithResult()

    override fun delete(@PathVariable id: Long): Result<EmptyResult> =
        DeleteTemplateCommand(id).executeWithResult()
}

@RestController
@RequestMapping("/api/admin/operations")
class AdminOperationRestfulServiceImpl : AdminOperationRestfulService {

    override fun list(action: String?, userId: Long?, page: Int, size: Int): Result<OperationPageResult> =
        ListOperationsCommand(OperationListRequest(action, userId, page, size)).executeWithResult()
}
