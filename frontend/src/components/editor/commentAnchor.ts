/**
 * 评论锚定高亮：跳转到某条评论对应的正文选区时，短暂着色提示。
 * 位置来自评论记录的 anchorFrom/anchorTo（ProseMirror 文档位置），由 PageView 触发。
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'

const KEY = new PluginKey('commentAnchor')
const META = 'commentAnchorFlash'

export const CommentAnchorHighlight = Extension.create({
  name: 'commentAnchorHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(META) as { from: number; to: number } | undefined
            if (meta) {
              if (meta.from >= meta.to) return DecorationSet.empty
              return DecorationSet.create(tr.doc, [
                Decoration.inline(meta.from, meta.to, { class: 'wiki-comment-anchor-flash' }),
              ])
            }
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return KEY.getState(state) as DecorationSet | undefined
          },
        },
      }),
    ]
  },
})

/** 滚动到锚点并高亮 2 秒；位置越界时按引用文本检索兜底返回 false */
export function flashCommentAnchor(editor: Editor, from: number | null, to: number | null, text?: string | null): boolean {
  if (!editor || editor.isDestroyed) return false
  const docSize = editor.state.doc.content.size
  let start = from
  let end = to
  if (start == null || end == null || start >= end || start < 0 || end > docSize) {
    // 编辑后位置漂移/越界：按引用文本找第一处匹配
    const needle = text?.trim()
    if (!needle) return false
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (found >= 0 || !node.isTextblock) return false
      const idx = node.textContent.indexOf(needle)
      if (idx >= 0) {
        found = pos + 1 + idx
        return false
      }
      return true
    })
    if (found < 0) return false
    start = found
    end = found + (text as string).trim().length
  }
  editor.chain().setTextSelection({ from: start, to: end }).scrollIntoView().run()
  editor.view.dispatch(editor.state.tr.setMeta(META, { from: start, to: end }))
  window.setTimeout(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(META, { from: 0, to: 0 }))
  }, 2200)
  return true
}
