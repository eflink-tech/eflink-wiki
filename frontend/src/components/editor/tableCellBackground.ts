/**
 * 表格单元格背景色扩展：给 tableCell / tableHeader 增加 backgroundColor 属性，
 * 以 inline style 渲染。设置入口在表格右键菜单的色板（TableInteractions）。
 */
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

/** backgroundColor 属性定义（cell 与 header 共用） */
function withBackgroundColor() {
  return {
    addAttributes(this: { parent?: () => Record<string, unknown> }) {
      return {
        ...this.parent?.(),
        backgroundColor: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
          renderHTML: (attributes: Record<string, unknown>) =>
            attributes.backgroundColor
              ? { style: `background-color: ${String(attributes.backgroundColor)}` }
              : {},
        },
      }
    },
  }
}

export const TableCellWithBackground = TableCell.extend(withBackgroundColor())
export const TableHeaderWithBackground = TableHeader.extend(withBackgroundColor())
