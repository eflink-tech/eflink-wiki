package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody

/** 页面模板 */
class TemplateResult : DataTransferObjectBase() {
    var id: Long = 0
    var title: String = ""
    var description: String? = null
    var createdByName: String? = null
    var createdAt: Long? = null
}

class TemplateListResult : DataTransferObjectBase() {
    var list: MutableList<TemplateResult> = mutableListOf()
}

data class SaveTemplateRequest(val title: String = "", val description: String? = null)

class TemplateDetailResult : DataTransferObjectBase() {
    var id: Long = 0
    var title: String = ""
    var description: String? = null
    var content: String? = null
}

/** 把页面另存为模板（取当前已发布版本，无版本则取草稿） */
class SaveAsTemplateCommand(val nodeId: Long, val request: SaveTemplateRequest) : CommandObjectBase<TemplateResult>()

class ListTemplatesCommand : CommandObjectBase<TemplateListResult>()

class GetTemplateCommand(val id: Long) : CommandObjectBase<TemplateDetailResult>()

class DeleteTemplateCommand(val id: Long) : CommandObjectBase<tech.eflink.wiki.core.communication.EmptyResult>()

@Tag(name = "知识库-模板", description = "页面另存为模板 / 模板列表 / 从模板建页配合创建页面接口的 templateId")
interface TemplateRestfulService {

    @Operation(summary = "模板列表")
    @GetMapping("/templates")
    fun list(): Result<TemplateListResult>

    @Operation(summary = "模板详情", description = "含正文 JSON，从模板建页时前端直接作为新页面草稿初始内容")
    @GetMapping("/templates/{id}")
    fun detail(@PathVariable id: Long): Result<TemplateDetailResult>

    @Operation(summary = "另存为模板", description = "编辑者及以上；内容取页面当前已发布版本，无版本时取我的草稿")
    @PostMapping("/nodes/{nodeId}/save-as-template")
    fun saveAsTemplate(
        @PathVariable nodeId: Long,
        @RequestBody request: SaveTemplateRequest
    ): Result<TemplateResult>

    @Operation(summary = "删除模板", description = "创建人或系统管理员")
    @DeleteMapping("/templates/{id}")
    fun delete(@PathVariable id: Long): Result<tech.eflink.wiki.core.communication.EmptyResult>
}
