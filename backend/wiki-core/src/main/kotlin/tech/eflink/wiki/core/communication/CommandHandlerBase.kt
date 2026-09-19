package tech.eflink.wiki.core.communication

import org.springframework.context.event.EventListener
import java.lang.reflect.ParameterizedType

/**
 * 命令处理器基类：Bean 就绪后通过应用事件自注册到命令注册表，无需手动配置
 */
abstract class CommandHandlerBase<T : CommandObject<R>, R : DataTransferObject> : CommandHandler<T, R> {

    @Suppress("UNCHECKED_CAST")
    @EventListener(classes = [CommandHandlerRegistering::class])
    fun register() {
        val clazz = this.javaClass
        val parameterizedType = if (clazz.genericSuperclass is ParameterizedType) {
            clazz.genericSuperclass as ParameterizedType
        } else {
            clazz.superclass.genericSuperclass as ParameterizedType
        }
        val type = parameterizedType.actualTypeArguments[0] as Class<T>
        CommandObjectBase.register(type, this::class.java)
    }

    /** 验证命令对象，子类按需覆盖 */
    override fun validate(command: T) {
    }
}
