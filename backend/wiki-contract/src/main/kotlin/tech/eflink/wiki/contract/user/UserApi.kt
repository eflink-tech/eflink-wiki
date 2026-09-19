package tech.eflink.wiki.contract.user

import tech.eflink.wiki.contract.auth.UserResult
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody

/** 更新个人信息请求 */
data class UpdateMeRequest(
    val displayName: String? = null,
    val avatar: String? = null
)

class GetMeCommand : CommandObjectBase<UserResult>()

class UpdateMeCommand(val request: UpdateMeRequest) : CommandObjectBase<UserResult>()

@Tag(name = "个人中心", description = "当前登录用户的信息查询与修改")
interface UserRestfulService {

    @Operation(summary = "我的信息")
    @GetMapping("/me")
    fun me(): Result<UserResult>

    @Operation(summary = "更新个人信息", description = "可更新姓名与头像")
    @PutMapping("/me")
    fun updateMe(@RequestBody request: UpdateMeRequest): Result<UserResult>
}
