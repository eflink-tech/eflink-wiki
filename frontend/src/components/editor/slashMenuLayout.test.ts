import { describe, expect, it } from 'vitest'
import { pickCaretAnchor, placeSlashMenu, SLASH_MENU_FULL_H, SLASH_MENU_WIDTH } from './slashMenuLayout'

describe('placeSlashMenu', () => {
  it('加号在左下时菜单贴着加号水平位置并向上展开，而不是钉到视口右上', () => {
    const r = placeSlashMenu(
      { left: 48, top: 720, bottom: 744 },
      { width: 1280, height: 800 },
    )
    expect(r.left).toBe(48)
    expect(r.left).toBeLessThan(400)
    expect(r.top).toBeLessThan(720)
    expect(r.top + SLASH_MENU_FULL_H).toBeLessThanOrEqual(720)
    expect(r.cursorTop).toBe(720)
  })

  it('矮面板（表情）贴着底部光标上方，不会跟着满高斜杠菜单翻到视口中上部', () => {
    const r = placeSlashMenu(
      { left: 48, top: 720, bottom: 744 },
      { width: 1280, height: 800 },
      280,
      320,
    )
    expect(r.top).toBe(432)
    expect(r.top).toBeGreaterThan(400)
    expect(r.cursorBottom).toBe(744)
  })
  it('加号在左上时菜单出现在加号下方', () => {
    const r = placeSlashMenu(
      { left: 48, top: 80, bottom: 104 },
      { width: 1280, height: 800 },
    )
    expect(r.left).toBe(48)
    expect(r.top).toBe(112)
  })

  it('锚点 left 超出视口时只裁到能放下菜单，不把菜单挪到无关区域', () => {
    const r = placeSlashMenu(
      { left: 2000, top: 100, bottom: 120 },
      { width: 1280, height: 800 },
    )
    expect(r.left + SLASH_MENU_WIDTH).toBeLessThanOrEqual(1280 - 8)
    expect(r.left).toBeGreaterThanOrEqual(12)
  })
})

describe('pickCaretAnchor', () => {
  it('块边界两侧取更靠左那一侧的完整矩形，避免 left/top 分别来自表格右缘和空行', () => {
    const a = pickCaretAnchor(
      { left: 980, top: 120, bottom: 140 },
      { left: 64, top: 700, bottom: 724 },
    )
    expect(a).toEqual({ left: 64, top: 700, bottom: 724 })
  })

  it('空行光标落在宽块右缘时回落到块左边', () => {
    const a = pickCaretAnchor(
      { left: 900, top: 700, bottom: 724 },
      { left: 890, top: 700, bottom: 724 },
      { left: 64, right: 920 },
    )
    expect(a.left).toBe(64)
    expect(a.top).toBe(700)
    expect(a.bottom).toBe(724)
  })

  it('行内斜杠保持光标 left，不回落到段落开头', () => {
    const a = pickCaretAnchor(
      { left: 240, top: 200, bottom: 224 },
      { left: 242, top: 200, bottom: 224 },
      { left: 64, right: 920 },
    )
    expect(a.left).toBe(240)
  })
})
