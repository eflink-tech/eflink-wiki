/**
 * 尾随空行扩展：编辑态下文档末尾永远保留一个空段落。
 * - 末块不是「空段落」（标题/表格/代码块/嵌入卡/分栏/有文字的段落…）时，自动在文末补一个空段落，
 *   用户在最后一行输入内容后下方始终有多余的一行可继续点击输入；
 * - 末尾出现连续空段落时收敛为一个（保留最后一个），防止回车堆积空行；
 * - 仅编辑态生效（阅读/演示实例 isEditable=false，appendTransaction 直接跳过，不改动文档）。
 * 实现：ProseMirror appendTransaction（带 meta 防循环触发）。
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

export const TrailingNode = Extension.create({
  name: 'trailingNode',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction: (transactions, _oldState, newState) => {
          const { doc, tr, schema } = newState

          // 自身触发的变更不再处理，避免死循环
          if (transactions.some((t) => t.getMeta('trailingNode'))) return null
          // 仅编辑态注入空行
          if (!editor.isEditable) return null
          if (doc.content.size === 0) return null
          if (!schema.nodes.paragraph) return null

          const lastChild = doc.lastChild
          if (!lastChild) return null
          const isEmptyPara = (n: PMNode) => n.type.name === 'paragraph' && n.content.size === 0
          const end = doc.content.size

          if (isEmptyPara(lastChild)) {
            // 文末已有空行：把末尾连续的空段落收敛为一个（保留最后一个，光标通常在它上面）
            let cutFrom = -1
            let pos = end - lastChild.nodeSize
            for (let i = doc.childCount - 2; i >= 0; i--) {
              const child = doc.maybeChild(i)
              if (!child || !isEmptyPara(child)) break
              pos -= child.nodeSize
              cutFrom = pos
            }
            if (cutFrom >= 0) {
              return tr.delete(cutFrom, end - lastChild.nodeSize).setMeta('trailingNode', true)
            }
            return null
          }

          // 末块非空段落：补一个空行
          return tr.insert(end, schema.nodes.paragraph.create()).setMeta('trailingNode', true)
        },
      }),
    ]
  },
})
