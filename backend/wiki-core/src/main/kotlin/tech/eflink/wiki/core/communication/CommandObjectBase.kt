package tech.eflink.wiki.core.communication

import tech.eflink.wiki.core.ApplicationContextProvider
import tech.eflink.wiki.core.dto.Result
import java.lang.reflect.ParameterizedType

/**
 * 命令对象基类：execute 时按泛型实例化结果对象，并从注册表解析对应处理器执行 validate + handle
 */
abstract class CommandObjectBase<R : DataTransferObject> : CommandObject<R> {

    companion object {

        private val handlers: MutableMap<Class<out CommandObject<out DataTransferObject>>,
                Class<out CommandHandler<out CommandObject<out DataTransferObject>, out DataTransferObject>>> =
            mutableMapOf()

        fun <T : CommandObject<R>, R : DataTransferObject, K : CommandHandler<T, R>> register(
            commandClazz: Class<T>,
            handlerClazz: Class<K>
        ) {
            handlers[commandClazz] = handlerClazz
        }

        @Suppress("UNCHECKED_CAST")
        fun <T : CommandObject<R>, R : DataTransferObject> resolve(
            commandClazz: Class<T>,
            vararg args: Any?
        ): CommandHandler<T, R> {
            val clazz = handlers[commandClazz]
                ?: throw IllegalStateException("未找到命令处理器: ${commandClazz.simpleName}")
            return ApplicationContextProvider.context.getBean(clazz) as CommandHandler<T, R>
        }
    }

    @Suppress("UNCHECKED_CAST")
    override fun execute(vararg args: Any?): R {
        val parameterizedType = this.javaClass.genericSuperclass as ParameterizedType
        val type = parameterizedType.actualTypeArguments[0] as Class<R>
        val result = type.getDeclaredConstructor().newInstance()
        val handler = resolve(this.javaClass, *args)
        handler.validate(this)
        handler.handle(this, result)
        return result
    }

    /** 执行命令并返回统一的 Result 封装结果 */
    fun executeWithResult(vararg args: Any?): Result<R> = Result.success(execute(*args))
}
