package tech.eflink.wiki.app.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service

/**
 * 从 tiptap 内容 JSON 中提取 @提及 的用户ID集合。
 * mention 节点形如 {"type":"mention","attrs":{"id":"123","label":"张三"}}；
 * id 统一按字符串存储，这里转回 Long（非法值忽略）。
 */
@Service
class MentionExtractor(private val objectMapper: ObjectMapper) {

    fun extract(contentJson: String?): Set<Long> {
        if (contentJson.isNullOrBlank()) return emptySet()
        return runCatching {
            val root = objectMapper.readTree(contentJson)
            val ids = LinkedHashSet<Long>()
            walk(root, ids)
            ids
        }.getOrElse { emptySet() }
    }

    private fun walk(node: JsonNode, ids: MutableSet<Long>) {
        when {
            node.isObject -> {
                if (node.path("type").asText("") == "mention") {
                    val id = node.path("attrs").path("id").asText("")
                    id.toLongOrNull()?.let { ids.add(it) }
                }
                node.fields().forEachRemaining { (_, v) -> walk(v, ids) }
            }
            node.isArray -> node.forEach { walk(it, ids) }
        }
    }
}
