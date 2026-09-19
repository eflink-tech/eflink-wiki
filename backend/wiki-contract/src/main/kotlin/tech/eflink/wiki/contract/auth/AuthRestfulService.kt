package tech.eflink.wiki.contract.auth

import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody

@Tag(name = "认证服务", description = "登录 / 刷新令牌 / 登出 / 修改密码 / 图形验证码 / 首次初始化")
interface AuthRestfulService {

    @Operation(summary = "登录", description = "账号密码登录，开启验证码时需同时提交 captchaId 与 captchaCode")
    @PostMapping("/login")
    fun login(@RequestBody request: LoginRequest): Result<AuthResult>

    @Operation(summary = "刷新令牌", description = "用 refreshToken 换取新的双 Token（旧 refreshToken 立即作废，轮换机制）")
    @PostMapping("/refresh")
    fun refresh(@RequestBody request: RefreshTokenRequest): Result<RefreshResult>

    @Operation(summary = "登出", description = "吊销 refreshToken")
    @PostMapping("/logout")
    fun logout(@RequestBody request: LogoutRequest): Result<EmptyResult>

    @Operation(summary = "修改本人密码", description = "校验旧密码后设置新密码，成功后所有刷新令牌作废")
    @PostMapping("/change-password")
    fun changePassword(@RequestBody request: ChangePasswordRequest): Result<EmptyResult>

    @Operation(summary = "图形验证码", description = "返回 captchaId 与 base64 图片，5 分钟内有效，验证后立即失效")
    @GetMapping("/captcha")
    fun captcha(): Result<CaptchaResult>
}
