package tech.eflink.wiki.app.impl.admin.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.admin.handler.CreateUserCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.ListUsersCommandHandler
import tech.eflink.wiki.app.impl.admin.handler.UpdateUserCommandHandler
import tech.eflink.wiki.contract.admin.AdminUserRestfulService
import tech.eflink.wiki.contract.admin.CreateUserCommand
import tech.eflink.wiki.contract.admin.CreateUserRequest
import tech.eflink.wiki.contract.admin.ListUsersCommand
import tech.eflink.wiki.contract.admin.UpdateUserCommand
import tech.eflink.wiki.contract.admin.UpdateUserRequest
import tech.eflink.wiki.contract.admin.UserListRequest
import tech.eflink.wiki.contract.admin.UserPageResult
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/admin/users")
class AdminUserRestfulServiceImpl : AdminUserRestfulService {

    override fun list(keyword: String?, page: Int, size: Int): Result<UserPageResult> =
        ListUsersCommand(UserListRequest(keyword, page, size)).executeWithResult()

    override fun create(@RequestBody request: CreateUserRequest): Result<UserResult> =
        CreateUserCommand(request).executeWithResult()

    override fun update(@PathVariable id: Long, @RequestBody request: UpdateUserRequest): Result<UserResult> =
        UpdateUserCommand(id, request).executeWithResult()

    override fun importUsers(@org.springframework.web.bind.annotation.RequestPart("file") file: org.springframework.web.multipart.MultipartFile): Result<tech.eflink.wiki.contract.admin.ImportUsersResult> =
        tech.eflink.wiki.contract.admin.ImportUsersCommand(file).executeWithResult()
}
