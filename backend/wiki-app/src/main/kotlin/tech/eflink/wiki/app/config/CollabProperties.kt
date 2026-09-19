package tech.eflink.wiki.app.config

import org.springframework.boot.context.properties.ConfigurationProperties

/** 协同编辑（collab-server）对接配置 */
@ConfigurationProperties(prefix = "wiki.collab")
data class CollabProperties(
    /** collab-server 访问内部接口的共享密钥；两端一致才可用 */
    var internalKey: String = ""
)
