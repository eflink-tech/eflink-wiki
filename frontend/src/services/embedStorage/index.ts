/**
 * 嵌入块存储适配入口：按类型动态加载对应模块，
 * 保证每个 @eflink-tech/* 包只打包进自己的 chunk（EmbedEditor 路由只取其一）。
 */
import type { EmbedType } from './core'

export type { EmbedSaveStatus, EmbedType } from './core'
export { EMBED_LABELS, isSupportedEmbedType, subscribeEmbedSaveStatus } from './core'

/** 预备嵌入编辑器：
 * - word / excel：返回 storage prop（由 EmbedEditor 以 props 传入编辑器组件）
 * - pptx / draw / mindmap：注入全局存储后端后返回 null
 * 同时统一设置包内顶栏的返回地址。须在对应编辑器组件挂载前 await 完成。
 */
export async function prepareEmbedEditor(
  type: EmbedType,
  nodeId: number,
  embedId: string,
  backHref: string,
  /** false 时不注入返回地址：包顶栏不渲染返回箭头（业务系统可控） */
  options?: { injectBack?: boolean },
): Promise<unknown> {
  const injectBack = options?.injectBack !== false
  switch (type) {
    case 'word':
      return (await import('./word')).prepareWordEmbed(nodeId, embedId, backHref, injectBack)
    case 'excel':
      return (await import('./excel')).prepareExcelEmbed(nodeId, embedId, backHref, injectBack)
    case 'pptx':
      return (await import('./pptx')).preparePptxEmbed(nodeId, embedId, backHref, injectBack)
    case 'draw':
      return (await import('./draw')).prepareDrawEmbed(nodeId, embedId, backHref, injectBack)
    case 'mindmap':
      return (await import('./mindmap')).prepareMindmapEmbed(nodeId, embedId, backHref, injectBack)
    default: {
      const exhaustive: never = type
      throw new Error(`不支持的嵌入块类型：${String(exhaustive)}`)
    }
  }
}
