// @vitest-environment jsdom
/**
 * 分栏渲染冒烟测试：真实挂载 WikiEditor（React + ProseMirror），
 * 验证 insertColumns 后 DOM 中出现分栏结构与两个栏容器。
 */
import { describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { Editor } from '@tiptap/react'
import WikiEditor from './WikiEditor'

describe('columns rendering', () => {
  it('插入 2 栏后 DOM 渲染出分栏结构', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const holder: { root: Root | null; editor: Editor | null } = { root: null, editor: null }

    await act(async () => {
      holder.root = createRoot(container)
      holder.root.render(
        <MemoryRouter initialEntries={['/app/space/1/page/1']}>
          <WikiEditor
            initialContent={'{"type":"doc","content":[{"type":"paragraph"}]}'}
            editable
            onReady={(ed) => {
              holder.editor = ed
            }}
          />
        </MemoryRouter>,
      )
    })

    const ed = holder.editor as unknown as Editor
    expect(ed).not.toBeNull()
    await act(async () => {
      ed.commands.focus(1)
      const ok = ed.commands.insertColumns({ count: 2 })
      expect(ok).toBe(true)
    })
    await act(async () => {
      // 触发一轮渲染
      await new Promise((r) => setTimeout(r, 50))
    })

    const html = container.innerHTML
    console.log('HAS wrapper:', html.includes('wiki-columns-wrap'))
    console.log('HAS columns:', html.includes('wiki-columns'))
    console.log('HAS column divs:', (html.match(/data-column/g) ?? []).length)
    console.log('DOC:', JSON.stringify(ed.getJSON()))
    console.log('SNIPPET:', container.querySelector('.wiki-columns-wrap')?.outerHTML?.slice(0, 600))
    expect(html.includes('wiki-columns-wrap')).toBe(true)
    expect(container.querySelectorAll('[data-column]').length).toBe(2)
    // 每栏必须能渲染内部段落，否则空栏高度为 0、看起来像没插入
    expect(container.querySelectorAll('[data-column] p').length).toBe(2)
    ;(holder.root as Root).unmount()
    container.remove()
  })
})
