import { describe, expect, it } from 'vitest'
import {
  layoutPdfPages,
  pickCanvasScale,
  sanitizePdfBasename,
} from './pagePdf'

describe('sanitizePdfBasename', () => {
  it('去掉路径非法字符，空名回落到未命名页面', () => {
    expect(sanitizePdfBasename('需求/设计:v1')).toBe('需求_设计_v1')
    expect(sanitizePdfBasename('   ')).toBe('未命名页面')
  })
})

describe('pickCanvasScale', () => {
  it('普通页面用目标倍率', () => {
    expect(pickCanvasScale(800, 1200, 2)).toBe(2)
  })

  it('超高内容会降倍率以免撑破 canvas 上限', () => {
    const scale = pickCanvasScale(800, 20000, 2)
    expect(scale).toBeLessThan(2)
    expect(scale).toBeGreaterThan(0)
    expect(800 * scale).toBeLessThanOrEqual(16384)
    expect(20000 * scale).toBeLessThanOrEqual(16384)
  })

  it('极高内容可以低于 0.5，避免被下限撑破 canvas', () => {
    const scale = pickCanvasScale(800, 40000, 2)
    expect(scale).toBeLessThan(0.5)
    expect(40000 * scale).toBeLessThanOrEqual(16384)
  })
})

describe('layoutPdfPages', () => {
  it('短内容一页', () => {
    const r = layoutPdfPages(800, 400)
    expect(r.pageCount).toBe(1)
    expect(r.imgWidthMm).toBe(190)
  })

  it('长内容按页高分页', () => {
    const r = layoutPdfPages(800, 8000)
    expect(r.pageCount).toBeGreaterThan(1)
    expect(r.pageCount).toBe(Math.ceil(r.imgHeightMm / r.innerHeightMm))
  })
})
