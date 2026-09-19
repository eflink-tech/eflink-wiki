package tech.eflink.wiki.app.service

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import tech.eflink.wiki.app.config.WikiProperties
import tech.eflink.wiki.core.search.SearchPort
import tech.eflink.wiki.store.repository.VersionRepository

/** 默认实现：MySQL ngram 全文检索（同步查询，无需额外服务） */
@Component
@ConditionalOnProperty(name = ["wiki.search.engine"], havingValue = "mysql", matchIfMissing = true)
class MysqlSearchAdapter(private val versionRepository: VersionRepository) : SearchPort {

    /** MySQL 方案发布即建索引（FULLTEXT 随行存储），无需主动索引 */
    override fun indexNode(nodeId: Long, title: String, content: String?) = Unit

    override fun removeNodes(nodeIds: List<Long>) = Unit

    override fun searchNodeIds(keyword: String, limit: Int): List<Long> =
        versionRepository.searchNodeIds(keyword, limit)
}

/**
 * Meilisearch 适配器（wiki.search.engine=meilisearch 时启用）：
 * 发布时同步文档，删除时移除，搜索走 HTTP。需部署 Meilisearch 服务并配置 wiki.search.meili。
 */
@Component
@ConditionalOnProperty(name = ["wiki.search.engine"], havingValue = "meilisearch")
class MeiliSearchAdapter(private val props: WikiProperties) : SearchPort {

    private val meili get() = props.search.meili

    private val client: RestClient by lazy {
        RestClient.builder()
            .baseUrl(meili.host)
            .defaultHeaders { headers ->
                if (meili.apiKey.isNotBlank()) headers.setBearerAuth(meili.apiKey)
            }
            .build()
    }

    private val objectMapper = com.fasterxml.jackson.databind.ObjectMapper()

    override fun indexNode(nodeId: Long, title: String, content: String?) {
        runCatching {
            client.post()
                .uri("/indexes/{index}/documents?primaryKey=id", meili.index)
                .contentType(MediaType.APPLICATION_JSON)
                .body(objectMapper.writeValueAsString(
                    listOf(mapOf("id" to nodeId.toString(), "title" to title, "content" to (content ?: "")))
                ))
                .retrieve()
                .toBodilessEntity()
        }.onFailure { org.slf4j.LoggerFactory.getLogger(javaClass).warn("Meilisearch 索引失败: {}", it.message) }
    }

    override fun removeNodes(nodeIds: List<Long>) {
        if (nodeIds.isEmpty()) return
        runCatching {
            client.post()
                .uri("/indexes/{index}/documents/delete-batch", meili.index)
                .contentType(MediaType.APPLICATION_JSON)
                .body(objectMapper.writeValueAsString(nodeIds.map { it.toString() }))
                .retrieve()
                .toBodilessEntity()
        }.onFailure { org.slf4j.LoggerFactory.getLogger(javaClass).warn("Meilisearch 删除失败: {}", it.message) }
    }

    override fun searchNodeIds(keyword: String, limit: Int): List<Long> {
        if (keyword.isBlank()) return emptyList()
        return runCatching {
            val resp = client.post()
                .uri("/indexes/{index}/search", meili.index)
                .contentType(MediaType.APPLICATION_JSON)
                .body(objectMapper.writeValueAsString(mapOf("q" to keyword, "limit" to limit)))
                .retrieve()
                .body(String::class.java)
            val root = objectMapper.readTree(resp)
            root.get("hits")?.map { it.get("id").asText().toLong() } ?: emptyList()
        }.getOrElse {
            org.slf4j.LoggerFactory.getLogger(javaClass).warn("Meilisearch 检索失败: {}", it.message)
            emptyList()
        }
    }
}
