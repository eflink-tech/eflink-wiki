package tech.eflink.wiki.contract.basic

import tech.eflink.wiki.contract.auth.AuthResult
import tech.eflink.wiki.contract.auth.SetupRequest
import tech.eflink.wiki.contract.auth.SetupStatusResult
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody

@Tag(name = "首次初始化", description = "系统首次部署时创建第一个管理员；完成后接口自动关闭")
interface SetupRestfulService {

    @Operation(summary = "初始化状态", description = "是否已完成首次初始化（系统内是否已存在用户）")
    @GetMapping("/status")
    fun status(): Result<SetupStatusResult>

    @Operation(summary = "首次初始化", description = "仅当系统内没有任何用户时可用，创建第一个管理员并直接登录")
    @PostMapping
    fun setup(@RequestBody request: SetupRequest): Result<AuthResult>
}
