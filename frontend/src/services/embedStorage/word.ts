/** word 嵌入块存储适配：只引入 @eflink-tech/word（拆分原因见 core.ts 头注释） */
import { EMPTY_DOC_CONTENT, setEditorBackHref as setWordBackHref } from '@eflink-tech/word'
import type {
  CanvasEditorData,
  DocumentMeta as WordDocumentMeta,
  StorageAdapter as WordStorageAdapter,
  WordDocument,
} from '@eflink-tech/word'
import { createEmbedAccessor, parseEmbedContent } from './core'

/** word 嵌入块默认标题 */
const WORD_FALLBACK_TITLE = '未命名文档'

/** content 列存 CanvasEditorData */
export function createWordStorage(nodeId: number, embedId: string): WordStorageAdapter {
  const accessor = createEmbedAccessor(nodeId, embedId, 'word', WORD_FALLBACK_TITLE)

  const put = (title: string, content: CanvasEditorData | null) =>
    accessor.save(content == null ? null : JSON.stringify(content), title)

  return {
    /** 新建/整体覆盖保存 */
    async save(doc) {
      await put(doc.title, doc.content ?? null)
    },

    /** 按 id 读取完整文档（id 即 embedId，统一读当前嵌入块） */
    async load() {
      const data = await accessor.load()
      const content = (parseEmbedContent(data.content) ?? EMPTY_DOC_CONTENT) as CanvasEditorData
      return {
        id: embedId,
        title: data.title || WORD_FALLBACK_TITLE,
        content,
        createdAt: data.updatedAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
        isFavorite: false,
        isDeleted: false,
      } as WordDocument
    },

    /** 嵌入块无文档列表 */
    async list(): Promise<WordDocumentMeta[]> {
      return []
    },

    /** 嵌入块不提供删除 */
    async delete() {},

    /** 仅改标题：先读现内容再整档写回，防清空正文 */
    async rename(_id, title) {
      await accessor.rename(title)
    },

    /** 编辑器保存：标题 + 正文一起落库 */
    async updateContent(_id, title, content) {
      await put(title, content ?? null)
    },
  }
}

/**
 * 预备 word 嵌入编辑器：设置包内顶栏返回地址，返回 storage prop
 * （WordEditor 支持 storage prop 注入并注册为全局默认）。
 * 须在 WordEditor 挂载前完成（编辑器挂载即读存储）。
 */
export async function prepareWordEmbed(nodeId: number, embedId: string, backHref: string, injectBack = true): Promise<WordStorageAdapter> {
  if (injectBack) setWordBackHref(backHref)
  return createWordStorage(nodeId, embedId)
}
