package tech.eflink.wiki.app

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.ApplicationContext
import org.springframework.stereotype.Component
import tech.eflink.wiki.core.communication.CommandHandlerRegistering

/** 应用就绪后发布命令注册事件，触发全部命令处理器自注册 */
@Component
class WebApplicationReady(private val applicationContext: ApplicationContext) : ApplicationRunner {

    override fun run(args: ApplicationArguments?) {
        applicationContext.publishEvent(CommandHandlerRegistering(this))
    }
}
