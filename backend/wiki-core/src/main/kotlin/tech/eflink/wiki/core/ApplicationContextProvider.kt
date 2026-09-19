package tech.eflink.wiki.core

import org.springframework.beans.BeansException
import org.springframework.context.ApplicationContext
import org.springframework.context.ApplicationContextAware
import org.springframework.stereotype.Component

/** 静态持有 Spring 容器，供命令注册表解析处理器 Bean */
@Component
class ApplicationContextProvider : ApplicationContextAware {

    companion object {
        lateinit var context: ApplicationContext
        private var initialized = false

        fun isInitialized(): Boolean = initialized
    }

    @Throws(BeansException::class)
    override fun setApplicationContext(applicationContext: ApplicationContext) {
        context = applicationContext
        initialized = true
    }
}
