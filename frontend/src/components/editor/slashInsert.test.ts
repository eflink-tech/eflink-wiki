// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import { FontSize, EMOJI_FONT_SIZE } from './fontSize'
import { insertEmoji, replaceRangeWithText } from './slashInsert'

describe('replaceRangeWithText（表情/日期插入）', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, TextStyle, FontSize],
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '标题' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '/' }] },
        ],
      },
    })
  })

  it('选区在标题时仍把表情插到斜杠位置，而不是标题里', () => {
    const slashFrom = editor.state.doc.textContent.indexOf('/')
    // 文档坐标：heading "标题" 是 pos 2–4 的文本，段落 '/' 在后面
    editor.commands.setTextSelection(2)
    const para = editor.state.doc.child(1)
    expect(para.textContent).toBe('/')
    const from = 1 + editor.state.doc.child(0).nodeSize
    const to = from + 1
    const ok = replaceRangeWithText(editor, from, to, '😀')
    expect(ok).toBe(true)
    expect(editor.state.doc.child(0).textContent).toBe('标题')
    expect(editor.state.doc.child(1).textContent).toBe('😀')
    expect(slashFrom).toBeGreaterThanOrEqual(0)
  })

  it('加号锚点 from=to 时空段落插入表情', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    editor.commands.setTextSelection(1)
    const ok = replaceRangeWithText(editor, 1, 1, '🎉')
    expect(ok).toBe(true)
    expect(editor.getText()).toBe('🎉')
  })

  it('插入表情时字号为正文默认的 3 倍（45px）', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    const ok = insertEmoji(editor, 1, 1, '😀')
    expect(ok).toBe(true)
    expect(EMOJI_FONT_SIZE).toBe('45px')
    const text = editor.getJSON().content?.[0]?.content?.[0] as {
      text?: string
      marks?: { type: string; attrs?: Record<string, unknown> }[]
    }
    expect(text.text).toBe('😀')
    expect(text.marks?.some((m) => m.type === 'textStyle' && m.attrs?.fontSize === '45px')).toBe(true)
    expect(editor.getHTML()).toContain('font-size: 45px')
  })

  it('插入表情后继续输入，正文不继承 45px 字号', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    insertEmoji(editor, 1, 1, '😀')
    editor.commands.insertContent('ab')
    const nodes = editor.getJSON().content?.[0]?.content as {
      text?: string
      marks?: { type: string; attrs?: Record<string, unknown> }[]
    }[]
    const follow = nodes?.find((n) => n.text === 'ab')
    expect(follow).toBeTruthy()
    expect(follow?.marks?.some((m) => m.attrs?.fontSize === '45px') ?? false).toBe(false)
  })
})
