package tech.eflink.wiki.core.search

/** 全文检索端口：MySQL ngram 为默认实现，Meilisearch 等以适配器替换 */
interface SearchPort {

    /** 索引一个已发布页面 */
    fun indexNode(nodeId: Long, title: String, content: String?)

    /** 从索引移除（彻底删除页面时） */
    fun removeNodes(nodeIds: List<Long>)

    /** 检索匹配的节点 ID（仅已发布、未删除；权限过滤由调用方完成） */
    fun searchNodeIds(keyword: String, limit: Int): List<Long>
}
