package tech.eflink.wiki.core.communication

import org.springframework.context.ApplicationEvent

/** 命令对象接口 */
interface CommandObject<R : DataTransferObject> {
    fun execute(vararg args: Any?): R
}

/** 命令处理器接口 */
interface CommandHandler<T : CommandObject<R>, R : DataTransferObject> {
    fun validate(command: T)
    fun handle(command: T, result: R)
}

/** 所有 DTO 的标记接口 */
interface DataTransferObject

/** DTO 基类（可变属性、无参构造，便于命令处理器填充） */
open class DataTransferObjectBase : DataTransferObject

/** 空返回对象：不需要明确返回值的场景 */
class EmptyResult : DataTransferObjectBase()

/** 应用就绪后发布该事件，触发全部命令处理器注册到命令注册表 */
class CommandHandlerRegistering(source: Any) : ApplicationEvent(source)
