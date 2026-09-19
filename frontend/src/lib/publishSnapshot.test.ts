import { describe, expect, it } from 'vitest'
import { applyPublishedSnapshot } from './publishSnapshot'

describe('applyPublishedSnapshot', () => {
  it('用刚发布的标题、正文和版本号覆盖阅读态快照', () => {
    const page = {
      nodeId: 7,
      title: '旧标题',
      content: '{"type":"doc","content":[{"type":"paragraph"}]}',
      versionNo: 1,
      publishedAt: null,
      viewCount: 0,
    }
    const next = applyPublishedSnapshot(page, {
      title: '新标题',
      content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"已发布"}]}]}',
      versionNo: 2,
    })
    expect(next.title).toBe('新标题')
    expect(next.versionNo).toBe(2)
    expect(next.content).toContain('已发布')
    expect(next.nodeId).toBe(7)
  })
})
