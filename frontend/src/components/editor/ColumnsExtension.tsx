/**
 * 分栏扩展：`columns`（栅格容器）/ `column`（单栏）两级节点，自研（TipTap 无官方实现）。
 * - 布局：columns 的 React NodeView 输出 CSS grid 容器（NodeViewContent），
 *   子 column 节点由 ProseMirror 按 renderHTML 渲染为 grid item，栏内是普通块内容
 * - 列数 2/3/4：悬浮/选中分栏时浮出工具条切换；减列时多余栏内容并入最后一栏，加列补空栏
 * - 限制：块手柄拖拽只作用于顶层块，整组分栏可拖动，栏内块不参与拖拽
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Trash2 } from 'lucide-react'

const MIN_COLS = 1
const MAX_COLS = 4

const clampCount = (n: unknown): number => {
  const v = Number(n)
  if (!Number.isFinite(v)) return MIN_COLS
  return Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(v)))
}

/* ---------- 栏内工具条（编辑态悬浮/选中时显示） ---------- */

function ColumnsNodeView({ node, editor, deleteNode, getPos }: NodeViewProps) {
  const count = clampCount(node.attrs.count)
  const editable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  })

  return (
    <NodeViewWrapper className="wiki-columns-wrap">
      {editable && (
        <div className="wiki-columns__bar" contentEditable={false}>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`wiki-columns__bar-btn ${count === n ? 'is-active' : ''}`}
              title={`${n} 列`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setColumnsCount(n, { pos: getPos() }).run()}
            >
              {n} 列
            </button>
          ))}
          <span className="wiki-columns__bar-sep" />
          <button
            type="button"
            className="wiki-columns__bar-btn is-danger"
            title="删除分栏（栏内内容一并删除）"
            onMouseDown={(e) => e.preventDefault()}
            onClick={deleteNode}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
      <NodeViewContent
        className="wiki-columns"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      />
    </NodeViewWrapper>
  )
}

export const WikiColumns = Node.create({
  name: 'columns',
  group: 'block',
  inline: false,
  // 栅格容器不直接收文本，内容固定为若干 column
  content: 'column+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: MIN_COLS,
        parseHTML: (element) => clampCount(element.getAttribute('data-columns-count')),
        renderHTML: (attributes) => ({ 'data-columns-count': String(clampCount(attributes.count)) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-columns': '' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnsNodeView)
  },

  addCommands() {
    return {
      /** 在当前光标处插入一个 count 列的分栏（每栏一个空段落） */
      insertColumns:
        (attrs) =>
        ({ commands }) => {
          // 未传 count 默认 2 栏；用 commands.insertContent 接到同一条 chain，避免内部 chain().run() 丢事务
          const count = clampCount(attrs?.count ?? 2)
          const columns = Array.from({ length: count }, () => ({
            type: 'column',
            content: [{ type: 'paragraph' }],
          }))
          return commands.insertContent({ type: 'columns', attrs: { count }, content: columns })
        },
      /** 调整分栏列数（1-4）：减列合并内容，加列补空栏。pos 缺省时从当前选区向上找 */
      setColumnsCount:
        (count, options) =>
        ({ state, view }) => {
          // 定位目标 columns 节点：优先用 NodeView 传入的位置，否则从选区向上遍历
          let target: ReturnType<typeof state.doc.nodeAt> | null = null
          let from = 0
          let to = 0
          if (typeof options?.pos === 'number') {
            const found = state.doc.nodeAt(options.pos)
            if (found?.type.name === 'columns') {
              target = found
              from = options.pos
              to = options.pos + found.nodeSize
            }
          }
          if (!target) {
            const { $from } = state.selection
            for (let d = $from.depth; d > 0; d--) {
              const node = $from.node(d)
              if (node.type.name !== 'columns') continue
              target = node
              from = $from.before(d)
              to = $from.after(d)
              break
            }
          }
          if (!target) return false

          const n = clampCount(count)
          const schema = state.schema
          // slice() 得到可变副本（Fragment.content 是只读数组）
          const cols = target.content.content.slice()
          let next: typeof cols
          if (cols.length > n) {
            // 减列：被删栏的全部内容并入保留的最后一栏
            const kept = cols.slice(0, n)
            const extra = cols.slice(n)
            const last = kept[kept.length - 1]
            let merged = last.content
            for (const e of extra) merged = merged.append(e.content)
            kept[kept.length - 1] = last.type.create(last.attrs, merged)
            next = kept
          } else if (cols.length < n) {
            // 加列：补空栏
            const empty = Array.from({ length: n - cols.length }, () =>
              schema.nodes.column.create(null, schema.nodes.paragraph.create()),
            )
            next = [...cols, ...empty]
          } else {
            return true // 列数未变
          }

          const tr = state.tr.replaceWith(from, to, schema.nodes.columns.create({ count: n }, next))
          view.dispatch(tr)
          return true
        },
    }
  },
})

export const WikiColumn = Node.create({
  name: 'column',
  // 不进 block group：避免 blockquote 等内容表达式意外接纳单栏
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-column]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-column': '', class: 'wiki-column' }, HTMLAttributes), 0]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiColumns: {
      /** 插入分栏（count 1-4，默认 2） */
      insertColumns: (attrs: { count?: number }) => ReturnType
      /** 调整分栏列数（1-4）；pos 为 columns 节点位置，缺省时从当前选区定位 */
      setColumnsCount: (count: number, options?: { pos?: number }) => ReturnType
    }
  }
}
