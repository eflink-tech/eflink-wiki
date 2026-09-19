// @vitest-environment jsdom
/**
 * 尾随空行扩展测试：编辑态文档末尾永远保留一个空段落。
 * 场景：末块有文字 / 末块是标题 / 连续空行收敛 / 回车不堆积 / 只读实例不注入。
 */
import { describe, expect, it } from 'vitest'
import { Editor, type Content } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TrailingNode } from './TrailingNode'

const makeEditor = (content: Content, editable = true) =>
  new Editor({ extensions: [StarterKit, TrailingNode], content, editable })

const nodesOf = (editor: Editor) => editor.getJSON().content ?? []
const isEmptyPara = (n: { type: string; content?: unknown[] }) =>
  n.type === 'paragraph' && !n.content?.length

describe('TrailingNode 尾随空行', () => {
  it('末块有文字时补一个空行', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sdkfdf' }] }],
    })
    editor.commands.focus('end')
    const nodes = nodesOf(editor)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].content?.[0]?.text).toBe('sdkfdf')
    expect(isEmptyPara(nodes[1] as { type: string; content?: never[] })).toBe(true)
  })

  it('末块是标题时补一个空行', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '我爱你中国' }] }],
    })
    editor.commands.focus('end')
    const nodes = nodesOf(editor)
    expect(nodes[nodes.length - 1].type).toBe('paragraph')
    expect(isEmptyPara(nodes[nodes.length - 1] as { type: string; content?: never[] })).toBe(true)
  })

  it('末尾连续空行收敛为一个', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    })
    editor.commands.focus('end')
    const nodes = nodesOf(editor)
    expect(nodes).toHaveLength(2)
    expect(isEmptyPara(nodes[1] as { type: string; content?: never[] })).toBe(true)
  })

  it('末尾连续回车不堆积空行', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    })
    editor.commands.focus('end')
    editor.commands.keyboardShortcut('Enter')
    editor.commands.keyboardShortcut('Enter')
    const nodes = nodesOf(editor)
    const emptyCount = nodes.filter((n) => isEmptyPara(n as { type: string; content?: never[] })).length
    expect(emptyCount).toBe(1)
    expect(nodes[nodes.length - 1].type).toBe('paragraph')
  })

  it('末块已是空段落时不重复追加', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'paragraph' },
      ],
    })
    editor.commands.focus('end')
    expect(nodesOf(editor)).toHaveLength(2)
  })

  it('只读实例不注入空行', () => {
    const editor = makeEditor(
      {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '标题' }] }],
      },
      false,
    )
    editor.commands.focus('end')
    const nodes = nodesOf(editor)
    expect(nodes).toHaveLength(1)
  })
})
