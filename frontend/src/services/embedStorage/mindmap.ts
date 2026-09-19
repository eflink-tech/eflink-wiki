/** mindmap 嵌入块存储适配：只引入 @eflink-tech/mindmap（拆分原因见 core.ts 头注释） */
import { createDocument, setEditorBackHref as setMindMapBackHref, setMindMapStorageBackend } from '@eflink-tech/mindmap'
import type { MindMapDocument, MindMapStorageBackend } from '@eflink-tech/mindmap'
import { createEmbedAccessor, parseEmbedContent } from './core'

/** mindmap 嵌入块默认标题 */
const MINDMAP_FALLBACK_TITLE = '思维导图'

/** content 列存整个 MindMapDocument */
export function createMindmapBackend(nodeId: number, embedId: string): MindMapStorageBackend {
  const accessor = createEmbedAccessor(nodeId, embedId, 'mindmap', MINDMAP_FALLBACK_TITLE)

  return {
    /** 不存在则创建，存在则整体覆盖 */
    async put(doc: MindMapDocument) {
      await accessor.save(JSON.stringify(doc ?? null), doc.title)
    },

    /** 按 id 读取（id 即 bootDocId=embedId）。结构校验：缺 rootId/nodes 视为
     * 空白导图，用包内工厂构造（返回 undefined 会让编辑器卡「加载中」） */
    async get(id): Promise<MindMapDocument | undefined> {
      const data = await accessor.load()
      const parsed = parseEmbedContent(data.content) as MindMapDocument | null
      if (parsed && parsed.rootId && parsed.nodes) {
        return { ...parsed, id }
      }
      return { ...createDocument(data.title || MINDMAP_FALLBACK_TITLE), id }
    },

    /** 嵌入块不提供删除 */
    async remove() {},

    /** 嵌入块无文档列表 */
    async list() {
      return []
    },

    /** 仅改标题：先读现内容再整档写回，防清空导图 */
    async rename(_id, title) {
      await accessor.rename(title)
    },
  }
}

/**
 * 预备 mindmap 嵌入编辑器：注入全局存储后端与顶栏返回地址（MindMapEditor 为
 * 自包含组件，挂载即读存储，bootDocId 直接传 embedId）。须在编辑器挂载前完成。
 */
export async function prepareMindmapEmbed(nodeId: number, embedId: string, backHref: string, injectBack = true): Promise<null> {
  setMindMapStorageBackend(createMindmapBackend(nodeId, embedId))
  if (injectBack) setMindMapBackHref(backHref)
  return null
}
