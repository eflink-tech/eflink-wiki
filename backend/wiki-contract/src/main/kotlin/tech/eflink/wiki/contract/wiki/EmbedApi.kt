package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody

/** 嵌入块数据（word/excel/pptx/draw/mindmap 模块的独立内容存储） */
class EmbedDataResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var embedId: String = ""
    var type: String = ""
    var title: String = ""
    var content: String? = null
    var updatedAt: Long? = null
}

data class SaveEmbedRequest(
    val type: String = "",
    val title: String = "",
    val content: String? = null
)

class GetEmbedDataCommand(val nodeId: Long, val embedId: String) : CommandObjectBase<EmbedDataResult>()

class SaveEmbedDataCommand(val nodeId: Long, val embedId: String, val request: SaveEmbedRequest) :
    CommandObjectBase<EmbedDataResult>()

@Tag(name = "知识库-嵌入块数据", description = "页面内嵌入文档的读写；读取需 viewer，保存需 editor")
interface EmbedRestfulService {

    @Operation(summary = "读取嵌入文档", description = "按（页面, 嵌入块ID）定位，供五模块编辑器加载内容")
    @GetMapping("/nodes/{nodeId}/embeds/{embedId}")
    fun get(
        @PathVariable nodeId: Long,
        @PathVariable embedId: String
    ): Result<EmbedDataResult>

    @Operation(summary = "保存嵌入文档", description = "编辑器全屏保存入口；首次保存自动建档")
    @PutMapping("/nodes/{nodeId}/embeds/{embedId}")
    fun save(
        @PathVariable nodeId: Long,
        @PathVariable embedId: String,
        @RequestBody request: SaveEmbedRequest
    ): Result<EmbedDataResult>
}
