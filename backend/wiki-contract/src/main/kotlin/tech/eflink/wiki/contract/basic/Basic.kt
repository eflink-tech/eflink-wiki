package tech.eflink.wiki.contract.basic

import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping

/** 公开配置（无需登录） */
class PublicConfigResult : DataTransferObjectBase() {
    var productName: String = ""
    var logoUrl: String = ""
    var version: String = ""
    var captchaEnabled: Boolean = false
    var embedBackShow: Boolean = true      // 全屏编辑器是否显示包自带返回按钮
    var embedBackHref: String = ""         // 返回按钮目标地址；空 = 返回知识库页面本身
    var eflinkLoginEnabled: Boolean = false // 是否展示 eflink 主站关联登录入口
}

class GetPublicConfigCommand : CommandObjectBase<PublicConfigResult>()

@Tag(name = "公开服务", description = "无需登录即可访问的公开接口")
interface PublicRestfulService {

    @Operation(summary = "产品配置", description = "返回产品名称、Logo、版本号与验证码开关，登录页/引导页据此渲染")
    @GetMapping("/config")
    fun config(): Result<PublicConfigResult>
}
