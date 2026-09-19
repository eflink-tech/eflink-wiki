package tech.eflink.wiki.app.impl.basic.restful

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.basic.handler.GetPublicConfigCommandHandler
import tech.eflink.wiki.app.impl.basic.handler.GetSetupStatusCommandHandler
import tech.eflink.wiki.app.impl.basic.handler.InitializeWorkspaceCommandHandler
import tech.eflink.wiki.contract.auth.AuthResult
import tech.eflink.wiki.contract.auth.SetupRequest
import tech.eflink.wiki.contract.auth.SetupStatusResult
import tech.eflink.wiki.contract.basic.GetPublicConfigCommand
import tech.eflink.wiki.contract.basic.PublicConfigResult
import tech.eflink.wiki.contract.basic.PublicRestfulService
import tech.eflink.wiki.contract.basic.SetupRestfulService
import tech.eflink.wiki.contract.auth.GetSetupStatusCommand
import tech.eflink.wiki.contract.auth.InitializeWorkspaceCommand
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/public")
class PublicRestfulServiceImpl : PublicRestfulService {

    override fun config(): Result<PublicConfigResult> = GetPublicConfigCommand().executeWithResult()
}

@RestController
@RequestMapping("/api/setup")
class SetupRestfulServiceImpl : SetupRestfulService {

    override fun status(): Result<SetupStatusResult> = GetSetupStatusCommand().executeWithResult()

    override fun setup(@RequestBody request: SetupRequest): Result<AuthResult> =
        InitializeWorkspaceCommand(request).executeWithResult()
}
