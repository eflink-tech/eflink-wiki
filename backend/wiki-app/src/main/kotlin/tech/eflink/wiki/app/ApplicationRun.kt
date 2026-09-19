package tech.eflink.wiki.app

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.boot.web.embedded.tomcat.TomcatProtocolHandlerCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.core.task.AsyncTaskExecutor
import org.springframework.core.task.support.TaskExecutorAdapter
import org.springframework.scheduling.annotation.EnableScheduling
import java.util.concurrent.Executors
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration

@SpringBootApplication
@ComponentScan(basePackages = ["tech.eflink.wiki"])
@EnableScheduling
@ConfigurationPropertiesScan
class ApplicationRun {

    /** 虚拟线程：异步任务执行器 */
    @Bean(TaskExecutionAutoConfiguration.APPLICATION_TASK_EXECUTOR_BEAN_NAME)
    fun asyncTaskExecutor(): AsyncTaskExecutor = TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor())

    /** 虚拟线程：Tomcat 请求处理 */
    @Bean
    fun tomcatProtocolHandlerCustomizer(): TomcatProtocolHandlerCustomizer<org.apache.coyote.ProtocolHandler> =
        TomcatProtocolHandlerCustomizer { protocolHandler ->
            protocolHandler.executor = Executors.newVirtualThreadPerTaskExecutor()
        }
}

fun main(args: Array<String>) {
    runApplication<ApplicationRun>(*args)
}
