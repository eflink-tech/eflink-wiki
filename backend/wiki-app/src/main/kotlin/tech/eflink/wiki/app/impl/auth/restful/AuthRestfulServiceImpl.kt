package tech.eflink.wiki.app.impl.auth.restful

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.auth.handler.ChangePasswordCommandHandler
import tech.eflink.wiki.app.impl.auth.handler.GetCaptchaCommandHandler
import tech.eflink.wiki.app.impl.auth.handler.LoginCommandHandler
import tech.eflink.wiki.app.impl.auth.handler.LogoutCommandHandler
import tech.eflink.wiki.app.impl.auth.handler.RefreshTokenCommandHandler
import tech.eflink.wiki.contract.auth.AuthResult
import tech.eflink.wiki.contract.auth.CaptchaResult
import tech.eflink.wiki.contract.auth.ChangePasswordCommand
import tech.eflink.wiki.contract.auth.ChangePasswordRequest
import tech.eflink.wiki.contract.auth.GetCaptchaCommand
import tech.eflink.wiki.contract.auth.LoginCommand
import tech.eflink.wiki.contract.auth.LoginRequest
import tech.eflink.wiki.contract.auth.LogoutCommand
import tech.eflink.wiki.contract.auth.LogoutRequest
import tech.eflink.wiki.contract.auth.RefreshResult
import tech.eflink.wiki.contract.auth.RefreshTokenCommand
import tech.eflink.wiki.contract.auth.RefreshTokenRequest
import tech.eflink.wiki.contract.auth.AuthRestfulService
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/auth")
class AuthRestfulServiceImpl : AuthRestfulService {

    override fun login(@RequestBody request: LoginRequest): Result<AuthResult> =
        LoginCommand(request).executeWithResult()

    override fun refresh(@RequestBody request: RefreshTokenRequest): Result<RefreshResult> =
        RefreshTokenCommand(request).executeWithResult()

    override fun logout(@RequestBody request: LogoutRequest): Result<EmptyResult> =
        LogoutCommand(request).executeWithResult()

    override fun changePassword(@RequestBody request: ChangePasswordRequest): Result<EmptyResult> =
        ChangePasswordCommand(request).executeWithResult()

    override fun captcha(): Result<CaptchaResult> = GetCaptchaCommand().executeWithResult()
}
