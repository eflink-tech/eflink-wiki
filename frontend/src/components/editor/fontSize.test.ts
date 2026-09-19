// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import { FontSize, markBareEmojis } from './fontSize'

describe('FontSize（文字大小）', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, TextStyle, FontSize],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }],
      },
    })
  })

  it('setFontSize 给选中文字加上 font-size 样式', () => {
    editor.commands.setTextSelection({ from: 1, to: 4 })
    const ok = editor.commands.setFontSize('24px')
    expect(ok).toBe(true)
    const text = editor.getJSON().content?.[0]?.content?.[0] as {
      marks?: { type: string; attrs?: Record<string, unknown> }[]
    }
    expect(text.marks?.some((m) => m.type === 'textStyle' && m.attrs?.fontSize === '24px')).toBe(true)
    expect(editor.getHTML()).toContain('font-size: 24px')
  })

  it('unsetFontSize 去掉字号，恢复默认', () => {
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.setFontSize('36px')
    editor.commands.unsetFontSize()
    const text = editor.getJSON().content?.[0]?.content?.[0] as {
      marks?: { type: string; attrs?: Record<string, unknown> }[]
    }
    const style = text.marks?.find((m) => m.type === 'textStyle')
    expect(style?.attrs?.fontSize ?? null).toBeFalsy()
    expect(editor.getHTML()).not.toContain('font-size: 36px')
  })
})

describe('emoji 自动 3 倍字号', () => {
  it('insertContent 插入裸 emoji 会打上 45px', () => {
    const editor = new Editor({
      extensions: [StarterKit, TextStyle, FontSize],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editor.commands.insertContent('🍺')
    expect(editor.getHTML()).toContain('font-size: 45px')
    expect(editor.getHTML()).toContain('🍺')
    editor.destroy()
  })

  it('载入已有裸 emoji 文档后 markBareEmojis 会放大', () => {
    const editor = new Editor({
      extensions: [StarterKit, TextStyle, FontSize],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '😍' }] }],
      },
    })
    const next = markBareEmojis(editor.state, editor.state.tr)
    expect(next).not.toBeNull()
    if (next) editor.view.dispatch(next)
    expect(editor.getHTML()).toContain('font-size: 45px')
    editor.destroy()
  })
})
