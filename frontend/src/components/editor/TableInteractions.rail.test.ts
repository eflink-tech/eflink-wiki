import { describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/react'
import { RAIL_GUTTER } from './tableRailHit'
import { resolveRailTablePosCandidates, tablePosFromDomHitArea } from './TableInteractions'

const TABLE_BOX = { left: 100, top: 80, width: 400, height: 120, right: 500, bottom: 200 }
const TABLE_POS = 5
const INNER_POS = 6

function mockTableEl(box: typeof TABLE_BOX) {
  return { getBoundingClientRect: () => box }
}

function mockResolve(posToTablePos: Map<number, number>) {
  return (pos: number) => {
    const tablePos = posToTablePos.get(pos)
    if (tablePos == null) {
      return {
        depth: 0,
        node: () => ({ type: { name: 'doc' } }),
        before: () => 0,
      }
    }
    return {
      depth: 1,
      node: (d: number) => ({ type: { name: d === 1 ? 'table' : 'doc' } }),
      before: () => tablePos,
    }
  }
}

function mockEditor(opts: {
  tables?: { el: ReturnType<typeof mockTableEl>; innerPos: number; tablePos: number }[]
  posAtCoords?: { pos: number } | null
  cursorPos?: number
  posToTablePos?: Map<number, number>
}): Editor {
  const tables = opts.tables ?? []
  const posToTablePos = opts.posToTablePos ?? new Map(tables.map((t) => [t.innerPos, t.tablePos]))
  return {
    view: {
      dom: {
        querySelectorAll: () => tables.map((t) => t.el),
      },
      posAtCoords: () => (opts.posAtCoords === undefined ? null : opts.posAtCoords),
      posAtDOM: (node: unknown) => {
        const hit = tables.find((t) => t.el === node)
        if (!hit) throw new Error('not in view')
        return hit.innerPos
      },
    },
    state: {
      selection: { from: opts.cursorPos ?? 1 },
      doc: { resolve: mockResolve(posToTablePos) },
    },
  } as unknown as Editor
}

describe('tablePosFromDomHitArea', () => {
  const el = mockTableEl(TABLE_BOX)
  const editor = mockEditor({
    tables: [{ el, innerPos: INNER_POS, tablePos: TABLE_POS }],
  })

  it('左缘 gutter 首次悬停能解析到表', () => {
    expect(tablePosFromDomHitArea(editor, TABLE_BOX.left - 10, 140)).toBe(TABLE_POS)
  })

  it('顶缘 gutter 首次悬停能解析到表', () => {
    expect(tablePosFromDomHitArea(editor, 300, TABLE_BOX.top - 10)).toBe(TABLE_POS)
  })

  it('热区外不命中', () => {
    expect(tablePosFromDomHitArea(editor, TABLE_BOX.left - RAIL_GUTTER - 1, 140)).toBeNull()
  })

  it('多表时命中指针所在热区的那张', () => {
    const a = mockTableEl({ left: 100, top: 80, width: 200, height: 80, right: 300, bottom: 160 })
    const b = mockTableEl({ left: 400, top: 80, width: 200, height: 80, right: 600, bottom: 160 })
    const multi = mockEditor({
      tables: [
        { el: a, innerPos: 6, tablePos: 5 },
        { el: b, innerPos: 26, tablePos: 25 },
      ],
    })
    expect(tablePosFromDomHitArea(multi, 400 - 8, 120)).toBe(25)
  })
})

describe('resolveRailTablePosCandidates', () => {
  const el = mockTableEl(TABLE_BOX)

  it('posAtCoords 与光标都不在表内时，gutter 扫描作为首次候选', () => {
    const editor = mockEditor({
      tables: [{ el, innerPos: INNER_POS, tablePos: TABLE_POS }],
      posAtCoords: null,
      cursorPos: 1,
    })
    expect(resolveRailTablePosCandidates(editor, TABLE_BOX.left - 10, 140, null)).toEqual([TABLE_POS])
  })

  it('posAtCoords 已命中表时不依赖 lastTablePos', () => {
    const editor = mockEditor({
      tables: [{ el, innerPos: INNER_POS, tablePos: TABLE_POS }],
      posAtCoords: { pos: INNER_POS },
      cursorPos: 1,
      posToTablePos: new Map([[INNER_POS, TABLE_POS]]),
    })
    expect(resolveRailTablePosCandidates(editor, 300, 140, null)).toEqual([TABLE_POS])
  })

  it('光标在表内时即使指针在热区外仍保留该表', () => {
    const editor = mockEditor({
      tables: [{ el, innerPos: INNER_POS, tablePos: TABLE_POS }],
      posAtCoords: null,
      cursorPos: INNER_POS,
      posToTablePos: new Map([[INNER_POS, TABLE_POS]]),
    })
    expect(resolveRailTablePosCandidates(editor, 10, 10, null)).toEqual([TABLE_POS])
  })
})
