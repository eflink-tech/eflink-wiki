// @vitest-environment happy-dom
/**
 * 阅读态 WikiEditor 在不重建实例时，也要把后续 initialContent 同步进编辑器。
 * 发布后仍停留在同一阅读实例上时，否则会继续显示旧正文。
 */
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import type { Editor } from '@tiptap/react'
import WikiEditor from './WikiEditor'

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
}

describe('WikiEditor 阅读态内容同步', () => {
  it('initialContent 变化后阅读态展示最新正文', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const holder: { root: Root | null; editor: Editor | null } = { root: null, editor: null }

    await act(async () => {
      holder.root = createRoot(container)
      holder.root.render(
        <WikiEditor
          initialContent={docJson('旧内容')}
          editable={false}
          onReady={(ed) => {
            holder.editor = ed
          }}
        />,
      )
    })

    expect(holder.editor).not.toBeNull()
    expect(holder.editor!.getText()).toContain('旧内容')

    await act(async () => {
      holder.root!.render(
        <WikiEditor
          initialContent={docJson('新发布内容')}
          editable={false}
          onReady={(ed) => {
            holder.editor = ed
          }}
        />,
      )
    })

    expect(holder.editor!.getText()).toContain('新发布内容')
    holder.root!.unmount()
    container.remove()
  })
})
