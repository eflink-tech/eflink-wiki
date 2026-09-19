import { describe, expect, it } from 'vitest'
import { PAGE_TITLE_MAX, preparePageTitle } from './pageTitle'

describe('preparePageTitle', () => {
  it('trim 后与当前相同则 unchanged', () => {
    expect(preparePageTitle('  测试资源  ', '测试资源')).toEqual({
      ok: true,
      title: '测试资源',
      changed: false,
    })
  })

  it('空标题无效', () => {
    expect(preparePageTitle('   ', '测试资源')).toEqual({ ok: false, reason: 'empty' })
    expect(preparePageTitle('', '测试资源')).toEqual({ ok: false, reason: 'empty' })
  })

  it('截断到 256 字并标记 changed', () => {
    const next = '新标题'
    expect(preparePageTitle(next, '测试资源')).toEqual({
      ok: true,
      title: next,
      changed: true,
    })
    const long = 'a'.repeat(PAGE_TITLE_MAX + 10)
    const r = preparePageTitle(long, '旧')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.title).toHaveLength(PAGE_TITLE_MAX)
      expect(r.changed).toBe(true)
    }
  })
})
