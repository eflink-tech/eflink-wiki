package tech.eflink.wiki.app.service.storage

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import tech.eflink.wiki.app.config.WikiProperties

/** 存储实现装配：按 wiki.storage.type 切换（local 默认 / qiniu） */
@Configuration
class StorageConfig {

    @Bean
    @ConditionalOnProperty(name = ["wiki.storage.type"], havingValue = "local", matchIfMissing = true)
    fun localStorageService(props: WikiProperties): StorageService = LocalStorageService(props)

    @Bean
    @ConditionalOnProperty(name = ["wiki.storage.type"], havingValue = "qiniu")
    fun qiniuStorageService(props: WikiProperties): StorageService = QiniuStorageService(props)
}
