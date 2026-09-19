/** excel 嵌入块存储适配：只引入 @eflink-tech/excel（拆分原因见 core.ts 头注释） */
import { createEmptySnapshot, setEditorBackHref as setExcelBackHref } from '@eflink-tech/excel'
import type {
  SheetDocument,
  StorageAdapter as ExcelStorageAdapter,
  WorkbookSnapshot,
} from '@eflink-tech/excel'
import { createEmbedAccessor, parseEmbedContent } from './core'

/** excel 嵌入块默认标题 */
const EXCEL_FALLBACK_TITLE = '未命名表格'

/** content 列存 WorkbookSnapshot */
export function createExcelStorage(nodeId: number, embedId: string): ExcelStorageAdapter {
  const accessor = createEmbedAccessor(nodeId, embedId, 'excel', EXCEL_FALLBACK_TITLE)

  const put = (title: string, snapshot: WorkbookSnapshot | null) =>
    accessor.save(snapshot == null ? null : JSON.stringify(snapshot), title)

  return {
    /** 新建/整体覆盖保存（导入、新建文档时用） */
    async save(doc) {
      await put(doc.title, doc.snapshot ?? null)
    },

    /** 按 id 读取完整文档（id 即 embedId，统一读当前嵌入块） */
    async load() {
      const data = await accessor.load()
      // 空内容兜底为空白快照：excel 编辑器挂载即 setSnapshot(doc.snapshot)，null 会永久卡「加载中…」
      const snapshot = (parseEmbedContent(data.content) ?? createEmptySnapshot(data.title || EXCEL_FALLBACK_TITLE)) as WorkbookSnapshot
      return {
        id: embedId,
        title: data.title || EXCEL_FALLBACK_TITLE,
        snapshot,
        createdAt: data.updatedAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
      } as SheetDocument
    },

    /** 嵌入块无文档列表 */
    async list() {
      return []
    },

    /** 嵌入块不提供删除 */
    async delete() {},

    /** 仅改标题：先读现内容再整档写回，防清空快照 */
    async rename(_id, title) {
      await accessor.rename(title)
    },

    /** 编辑器保存：标题 + 快照一起落库 */
    async updateContent(_id, title, snapshot) {
      await put(title, snapshot ?? null)
    },
  }
}

/**
 * 预备 excel 嵌入编辑器：设置包内顶栏返回地址，返回 storage prop
 * （SheetEditor 支持 storage prop 注入并注册为全局默认）。
 * 须在 SheetEditor 挂载前完成（编辑器挂载即读存储）。
 */
export async function prepareExcelEmbed(nodeId: number, embedId: string, backHref: string, injectBack = true): Promise<ExcelStorageAdapter> {
  if (injectBack) setExcelBackHref(backHref)
  return createExcelStorage(nodeId, embedId)
}
