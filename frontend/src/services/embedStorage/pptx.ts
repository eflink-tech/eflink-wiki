/** pptx 嵌入块存储适配：只引入 @eflink-tech/pptx（拆分原因见 core.ts 头注释） */
import { createPresentation, setEditorBackHref as setPptxBackHref, setPptxStorageBackend } from '@eflink-tech/pptx'
import type { Presentation, PptxStorageBackend } from '@eflink-tech/pptx'
import { createEmbedAccessor, parseEmbedContent } from './core'

/** pptx 嵌入块默认标题 */
const PPTX_FALLBACK_TITLE = '未命名演示'

/** 文档记录（与包内 PPTDocRecord 结构一致：id/name/presentation/createdAt/updatedAt） */
interface PptxDocRecord {
  id: string
  name: string
  presentation: Presentation
  createdAt: number
  updatedAt: number
}

/** content 列存 Presentation */
export function createPptxBackend(nodeId: number, embedId: string): PptxStorageBackend {
  const accessor = createEmbedAccessor(nodeId, embedId, 'pptx', PPTX_FALLBACK_TITLE)

  return {
    /** 不存在则创建，存在则整体覆盖 */
    async put(rec: PptxDocRecord) {
      await accessor.save(JSON.stringify(rec.presentation ?? null), rec.name)
    },

    /** 按 id 读取（id 即 bootDocId=embedId；空内容用包内工厂构造空白演示，
     * 返回 undefined 会触发编辑器内置新建、文档 id 与 embedId 脱钩） */
    async get(id): Promise<PptxDocRecord | undefined> {
      const data = await accessor.load()
      const parsed = parseEmbedContent(data.content) as Presentation | null
      const presentation = parsed ?? createPresentation(embedId)
      return {
        id,
        name: data.title || PPTX_FALLBACK_TITLE,
        presentation,
        createdAt: data.updatedAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
      }
    },

    /** 嵌入块不提供删除 */
    async remove() {},

    /** 嵌入块无文档列表 */
    async list() {
      return []
    },
  }
}

/**
 * 预备 pptx 嵌入编辑器：注入全局存储后端与顶栏返回地址（PptxEditor 为自包含组件，
 * 挂载即读存储，bootDocId 直接传 embedId）。须在 PptxEditor 挂载前完成。
 */
export async function preparePptxEmbed(nodeId: number, embedId: string, backHref: string, injectBack = true): Promise<null> {
  setPptxStorageBackend(createPptxBackend(nodeId, embedId))
  if (injectBack) setPptxBackHref(backHref)
  return null
}
