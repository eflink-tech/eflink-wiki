// @vitest-environment jsdom
/**
 * 分栏命令冒烟测试：直接验证 insertColumns / setColumnsCount 在真实 schema 下的行为。
 * 背景：用户反馈斜杠菜单选择 2 栏后页面无反应，需要确认命令是否真的写入文档。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { WikiColumn, WikiColumns } from './ColumnsExtension'

describe('columns extension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, WikiColumns, WikiColumn],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
    })
  })

  it('insertColumns 2 在光标处插入两栏', () => {
    editor.commands.setTextSelection(1)
    const ok = editor.commands.insertColumns({ count: 2 })
    expect(ok).toBe(true)
    const json = editor.getJSON()
    console.log('DOC:', JSON.stringify(json))
    const first = json.content?.[0]
    expect(first?.type).toBe('columns')
    expect((first?.attrs as { count?: number } | undefined)?.count).toBe(2)
    expect(first?.content?.length).toBe(2)
    expect(first?.content?.[0]?.type).toBe('column')
    expect(first?.content?.[0]?.content?.[0]?.type).toBe('paragraph')
  })

  it('模拟斜杠菜单流程：删除 /query 后插入分栏', () => {
    editor.commands.insertContentAt(1, { type: 'text', text: '/fx' })
    editor.commands.setTextSelection(4)
    // 斜杠菜单 activate 的等价调用
    const ok = editor.chain().focus().deleteRange({ from: 1, to: 4 }).insertColumns({ count: 2 }).run()
    expect(ok).toBe(true)
    const json = editor.getJSON()
    expect(json.content?.some((n) => n.type === 'columns')).toBe(true)
  })

  it('块手柄 + 锚定：空范围删除后插入 3 栏', () => {
    editor.commands.setTextSelection(1)
    const ok = editor.chain().focus().deleteRange({ from: 1, to: 1 }).insertColumns({ count: 3 }).run()
    expect(ok).toBe(true)
    const first = editor.getJSON().content?.[0]
    expect(first?.type).toBe('columns')
    expect((first?.attrs as { count?: number } | undefined)?.count).toBe(3)
    expect(first?.content?.length).toBe(3)
  })

  it('栏节点 DOM 带内容孔，空栏能渲染出段落', () => {
    editor.commands.setTextSelection(1)
    editor.commands.insertColumns({ count: 2 })
    expect(editor.view.dom.querySelectorAll('[data-column] p').length).toBe(2)
  })
})
