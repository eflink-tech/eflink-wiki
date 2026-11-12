import { describe, expect, it } from 'vitest'
import { buildDocxBlob } from './docxExport'

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '季度总结' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '加粗', marks: [{ type: 'bold' }] },
        { type: 'text', text: '与' },
        { type: 'text', text: '颜色', marks: [{ type: 'textStyle', attrs: { color: '#ef4444', fontSize: '20px' } }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '要点一' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '要点二' }] }] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一步' }] }] },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '列A' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '列B' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
          ],
        },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1' }] },
    { type: 'horizontalRule' },
  ],
}

describe('buildDocxBlob', () => {
  it('输出合法的 OOXML zip（PK 头）', async () => {
    const blob = await buildDocxBlob(JSON.stringify(doc), '测试文档')
    expect(blob.size).toBeGreaterThan(2000)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it('内容 JSON 损坏时抛出可读错误', async () => {
    await expect(buildDocxBlob('not-json', 'x')).rejects.toThrow('页面内容格式不正确')
  })
})
