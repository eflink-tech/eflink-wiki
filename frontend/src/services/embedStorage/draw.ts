/** draw 嵌入块存储适配：只引入 @eflink-tech/draw（拆分原因见 core.ts 头注释） */
import { createEmptyDocument, isDocumentData, setEditorBackHref as setDrawBackHref, setDrawRemoteStore } from '@eflink-tech/draw'
import type { DocumentData as DrawDocumentData, DrawRemoteStore } from '@eflink-tech/draw'
import { createEmbedAccessor, parseEmbedContent } from './core'

/** draw 嵌入块默认标题（DrawEditor 无标题概念，保存时回传缓存值） */
const DRAW_FALLBACK_TITLE = '流程图'

/** draw 单文档语义：content 列存 DocumentData */
export function createDrawStore(nodeId: number, embedId: string): DrawRemoteStore {
  const accessor = createEmbedAccessor(nodeId, embedId, 'draw', DRAW_FALLBACK_TITLE)

  return {
    /** 启动时拉取远端文档 */
    async load(): Promise<DrawDocumentData> {
      const data = await accessor.load()
      const parsed = parseEmbedContent(data.content)
      // 空内容返回包内空白文档：null 会让编辑器回退本地缓存画板（残留上一次绘制内容）
      return isDocumentData(parsed) ? parsed : createEmptyDocument()
    },

    /** 文档保存时整体覆盖远端 */
    async save(doc: DrawDocumentData) {
      await accessor.save(JSON.stringify(doc))
    },
  }
}

/**
 * 预备 draw 嵌入编辑器：注入全局远端存储与顶栏返回地址（DrawEditor 为自包含组件，
 * 挂载即读存储）。须在 DrawEditor 挂载前完成。
 */
export async function prepareDrawEmbed(nodeId: number, embedId: string, backHref: string, injectBack = true): Promise<null> {
  setDrawRemoteStore(createDrawStore(nodeId, embedId))
  if (injectBack) setDrawBackHref(backHref)
  return null
}
