/**
 * 知识库嵌入块存储适配层 —— 公共内核（不引入任何编辑器包）
 *
 * 数据源约定（与后端 EmbedApi 对应）：
 * - 读取：GET /api/wiki/nodes/{nodeId}/embeds/{embedId} → { content }（JSON 字符串）
 * - 保存：PUT 同路径，body { type, title, content }
 * - embedId 即嵌入文档的唯一 id，无需数字映射
 *
 * 按类型拆分模块（word.ts / excel.ts / ...）的原因与主站 officeStorage 相同：
 * 五个 @eflink-tech/* 包体积较大，EmbedEditor 按类型动态 import，
 * 每个嵌入路由只加载自己那一包的代码。
 *
 * 注意：后端 upsert 无条件覆盖 content（title 为空串时才跳过更新标题），
 * 因此所有保存路径都必须带完整 content，「仅改名」也要先读后写防止清空正文。
 */
import { getEmbedData, saveEmbedData } from '../../api/wiki'
import type { EmbedData } from '../../api/wiki'

/** 嵌入块类型（与后端 SaveEmbedRequest 校验集合一致） */
export type EmbedType = 'word' | 'excel' | 'pptx' | 'draw' | 'mindmap'

/** 各类型的中文展示名 */
export const EMBED_LABELS: Record<EmbedType, string> = {
  word: '文档',
  excel: '表格',
  pptx: '演示',
  draw: '流程图',
  mindmap: '思维导图',
}

/** 类型是否受支持（非法 ?type= 降级为占位卡片） */
export function isSupportedEmbedType(type: string | null): type is EmbedType {
  return type === 'word' || type === 'excel' || type === 'pptx' || type === 'draw' || type === 'mindmap'
}

/** 解析后端 content 列（JSON 字符串），为空/损坏返回 null */
export function parseEmbedContent(content: string | null): unknown {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/* ───────────── 保存状态总线：适配器落库时广播，EmbedEditor 顶栏订阅展示 ───────────── */

export type EmbedSaveStatus = 'saving' | 'saved' | 'error'

type SaveStatusListener = (status: EmbedSaveStatus) => void

const statusListeners = new Set<SaveStatusListener>()

/** 订阅保存状态变化（返回退订函数） */
export function subscribeEmbedSaveStatus(cb: SaveStatusListener): () => void {
  statusListeners.add(cb)
  return () => {
    statusListeners.delete(cb)
  }
}

function emitSaveStatus(status: EmbedSaveStatus): void {
  statusListeners.forEach((cb) => cb(status))
}

/** 包一层落库动作：统一广播「保存中 → 已保存 / 失败」状态 */
export async function runEmbedSave(action: () => Promise<unknown>): Promise<void> {
  emitSaveStatus('saving')
  try {
    await action()
    emitSaveStatus('saved')
  } catch (err) {
    emitSaveStatus('error')
    throw err
  }
}

/* ───────────── 通用读写器：各适配器共用，附带标题缓存（draw 等无标题编辑器保存时回传） ───────────── */

export interface EmbedAccessor {
  /** 当前已知标题（load 后为后端值） */
  readonly title: string
  /** 读取嵌入数据并刷新标题缓存 */
  load(): Promise<EmbedData>
  /** 保存嵌入数据（title 缺省回退缓存标题） */
  save(content: string | null, title?: string): Promise<void>
  /** 仅改标题：先读现内容再整档写回（后端会覆盖 content，直接写会清空正文） */
  rename(title: string): Promise<void>
}

/** 创建「按（页面, 嵌入块）读写嵌入数据」的读写器 */
export function createEmbedAccessor(nodeId: number, embedId: string, type: EmbedType, fallbackTitle: string): EmbedAccessor {
  let cachedTitle = fallbackTitle
  return {
    get title(): string {
      return cachedTitle
    },
    async load() {
      const data = await getEmbedData(nodeId, embedId)
      cachedTitle = data.title || cachedTitle
      return data
    },
    async save(content, title) {
      const t = title || cachedTitle
      await runEmbedSave(() => saveEmbedData(nodeId, embedId, { type, title: t, content }))
      cachedTitle = t
    },
    async rename(title) {
      const data = await this.load()
      const t = title || cachedTitle
      await this.save(data.content ?? null, t)
    },
  }
}
