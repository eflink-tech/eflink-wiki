package tech.eflink.wiki.app.impl.user.restful

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.auth.handler.GetMeCommandHandler
import tech.eflink.wiki.app.impl.auth.handler.UpdateMeCommandHandler
import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.contract.user.GetMeCommand
import tech.eflink.wiki.contract.user.UpdateMeCommand
import tech.eflink.wiki.contract.user.UpdateMeRequest
import tech.eflink.wiki.contract.user.UserRestfulService
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/user")
class UserRestfulServiceImpl : UserRestfulService {

    override fun me(): Result<UserResult> = GetMeCommand().executeWithResult()

    override fun updateMe(@RequestBody request: UpdateMeRequest): Result<UserResult> =
        UpdateMeCommand(request).executeWithResult()
}
