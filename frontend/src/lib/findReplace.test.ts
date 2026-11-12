// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FindReplace,
  getFindState,
  goToMatch,
  replaceAll,
  replaceCurrent,
  setFindQuery,
} from './findReplace'

let editor: Editor | null = null

function create(content: string): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, FindReplace],
    content,
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('findReplace', () => {
  it('跨文本节点（加粗边界）也能命中', () => {
    const ed = create('<p><strong>al</strong>pha beta alpha</p><p>ALPHA</p>')
    setFindQuery(ed, 'alpha', false)
    expect(getFindState(ed)?.matches).toHaveLength(3)
  })

  it('区分大小写时只命中完全一致项', () => {
    const ed = create('<p>alpha ALPHA</p>')
    setFindQuery(ed, 'alpha', true)
    expect(getFindState(ed)?.matches).toHaveLength(1)
  })

  it('不会跨段落匹配', () => {
    const ed = create('<p>alpha</p><p>beta</p>')
    setFindQuery(ed, 'alphabeta', false)
    expect(getFindState(ed)?.matches).toHaveLength(0)
  })

  it('全部替换后命中归零', () => {
    const ed = create('<p>foo foo</p><p>foo</p>')
    setFindQuery(ed, 'foo', false)
    expect(replaceAll(ed, 'bar')).toBe(3)
    expect(getFindState(ed)?.matches).toHaveLength(0)
    expect(ed.getText()).toBe('bar bar\n\nbar')
  })

  it('替换当前项后跳到下一处', () => {
    const ed = create('<p>foo foo</p>')
    setFindQuery(ed, 'foo', false)
    expect(replaceCurrent(ed, 'bar')).toBe(true)
    expect(getFindState(ed)?.matches).toHaveLength(1)
    expect(ed.getText()).toBe('bar foo')
  })

  it('goToMatch 选中命中文本', () => {
    const ed = create('<p>one two one</p>')
    setFindQuery(ed, 'one', false)
    goToMatch(ed, 1)
    const { from, to } = ed.state.selection
    expect(ed.state.doc.textBetween(from, to)).toBe('one')
  })
})
