import type { Editor } from '@tiptap/core'
import { EMOJI_FONT_SIZE } from './fontSize'

/**
 * 把 from–to（斜杠查询或加号锚点）替换为文本。
 * 用 ProseMirror insertText 一次完成，避免 focus()/insertContent 把内容插到失焦前的选区。
 */
export function replaceRangeWithText(
  editor: Editor,
  from: number,
  to: number,
  text: string,
  marks?: { type: string; attrs?: Record<string, unknown> }[],
): boolean {
  if (!text) return false
  return editor.commands.command(({ tr, state }) => {
    const size = tr.doc.content.size
    const a = Math.max(0, Math.min(from, size))
    const b = Math.max(a, Math.min(to, size))
    try {
      const $a = tr.doc.resolve(a)
      if ($a.parent.isTextblock) {
        if (marks?.length) {
          const pmMarks = marks
            .map((m) => state.schema.marks[m.type]?.create(m.attrs))
            .filter((m): m is NonNullable<typeof m> => Boolean(m))
          tr.replaceWith(a, b, state.schema.text(text, pmMarks))
        } else {
          tr.insertText(text, a, b)
        }
      } else {
        const para = state.schema.nodes.paragraph.create(null, state.schema.text(text))
        tr.insert(a, para)
      }
    } catch {
      return false
    }
    return true
  })
}

/** 在 from–to 插入表情，并带上 3 倍正文默认字号；随后输入不继承该字号 */
export function insertEmoji(editor: Editor, from: number, to: number, emoji: string): boolean {
  const ok = replaceRangeWithText(editor, from, to, emoji, [
    { type: 'textStyle', attrs: { fontSize: EMOJI_FONT_SIZE } },
  ])
  if (!ok) return false
  return editor.commands.command(({ tr, state }) => {
    const current = state.storedMarks ?? state.selection.$from.marks()
    tr.setStoredMarks(current.filter((m) => !(m.type.name === 'textStyle' && m.attrs.fontSize)))
    return true
  })
}
