import { describe, expect, it } from 'vitest'
import { jsonToMarkdown } from './markdown'

/** 临时冒烟测试：新块（附件/视频/音频/网页/子页面/分栏）导出降级 */
describe('markdown export new blocks', () => {
  const doc = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'attachment', attrs: { url: '/uploads/2026/09/a.pdf', name: '合同.pdf', size: 20480 } },
      { type: 'wikiVideo', attrs: { src: 'https://cdn.example.com/v.mp4' } },
      { type: 'wikiAudio', attrs: { src: '/uploads/2026/09/b.mp3' } },
      { type: 'webEmbed', attrs: { src: 'https://example.com' } },
      { type: 'pageRef', attrs: { nodeId: 42, title: '产品介绍' } },
      {
        type: 'columns',
        attrs: { count: 2 },
        content: [
          { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: '左栏' }] }] },
          { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: '右栏' }] }] },
        ],
      },
    ],
  })

  it('degrades new blocks to markdown', () => {
    const md = jsonToMarkdown(doc)
    expect(md).toContain('[附件] 合同.pdf (/uploads/2026/09/a.pdf)')
    expect(md).toContain('[视频](https://cdn.example.com/v.mp4)')
    expect(md).toContain('[音频](/uploads/2026/09/b.mp3)')
    expect(md).toContain('[网页](https://example.com)')
    expect(md).toContain('[子页面] 产品介绍 (#42)')
    expect(md).toContain('左栏')
    expect(md).toContain('右栏')
    const idxLeft = md.indexOf('左栏')
    const idxRight = md.indexOf('右栏')
    expect(idxLeft).toBeGreaterThan(-1)
    expect(idxRight).toBeGreaterThan(idxLeft)
  })
})
