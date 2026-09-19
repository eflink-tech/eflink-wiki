import { describe, expect, it } from 'vitest'
import {
  COL_DOT_OFFSET_Y,
  RAIL_GUTTER,
  ROW_DOT_OFFSET_X,
  colDotPos,
  hitHotDot,
  hitRailSegment,
  isDotSuppressed,
  isInTableHitArea,
  makeRect,
  rowDotPos,
  shouldShowRails,
  sliceMapColRects,
  sliceMapRowRects,
  type MappedCellGeom,
} from './tableRailHit'

const table = makeRect(100, 80, 400, 120)
const rows = [makeRect(100, 80, 400, 40), makeRect(100, 120, 400, 40), makeRect(100, 160, 400, 40)]
const cols = [
  makeRect(100, 80, 80, 120),
  makeRect(180, 80, 100, 120),
  makeRect(280, 80, 220, 120),
]

describe('tableRailHit', () => {
  it('makeRect 填 right/bottom', () => {
    expect(table).toEqual({ left: 100, top: 80, right: 500, bottom: 200, width: 400, height: 120 })
  })

  it('表内与外扩热区算命中，远离不算', () => {
    expect(isInTableHitArea(table, 300, 140)).toBe(true)
    expect(isInTableHitArea(table, table.left - RAIL_GUTTER + 1, 140)).toBe(true)
    expect(isInTableHitArea(table, 300, table.top - RAIL_GUTTER + 1)).toBe(true)
    expect(isInTableHitArea(table, table.left - RAIL_GUTTER - 1, 140)).toBe(false)
  })

  it('指针在热区或光标在表内才显示边轨', () => {
    expect(shouldShowRails(false, false)).toBe(false)
    expect(shouldShowRails(true, false)).toBe(true)
    expect(shouldShowRails(false, true)).toBe(true)
  })

  it('圆点在行/列交界处（下缘 / 右缘）', () => {
    expect(rowDotPos(table, rows[1]!)).toEqual({ x: 100 - ROW_DOT_OFFSET_X, y: 160 })
    expect(colDotPos(table, cols[1]!)).toEqual({ x: 280, y: 80 - COL_DOT_OFFSET_Y })
  })

  it('命中行圆点 / 列圆点，表内单元格不命中圆点', () => {
    const rowDot = rowDotPos(table, rows[1]!)
    expect(hitHotDot(table, rows, cols, rowDot.x, rowDot.y)).toEqual({ kind: 'row', index: 1 })
    const colDot = colDotPos(table, cols[0]!)
    expect(hitHotDot(table, rows, cols, colDot.x, colDot.y)).toEqual({ kind: 'col', index: 0 })
    expect(hitHotDot(table, rows, cols, 300, 140)).toBeNull()
  })

  it('整行选中后抑制该行圆点，其它行仍可命中', () => {
    const rowDot = rowDotPos(table, rows[1]!)
    const suppress = { rowStart: 1, rowEnd: 2 }
    expect(isDotSuppressed('row', 1, suppress)).toBe(true)
    expect(isDotSuppressed('row', 0, suppress)).toBe(false)
    expect(hitHotDot(table, rows, cols, rowDot.x, rowDot.y, suppress)).toBeNull()
    const other = rowDotPos(table, rows[0]!)
    expect(hitHotDot(table, rows, cols, other.x, other.y, suppress)).toEqual({ kind: 'row', index: 0 })
  })

  it('左缘热区命中行轨段，顶缘热区命中列轨段', () => {
    expect(hitRailSegment(table, rows, cols, table.left - 8, 140)).toEqual({ kind: 'row', index: 1 })
    expect(hitRailSegment(table, rows, cols, 230, table.top - 8)).toEqual({ kind: 'col', index: 1 })
    expect(hitRailSegment(table, rows, cols, 300, 140)).toBeNull()
  })
})

describe('sliceMapRowRects / sliceMapColRects', () => {
  it('colspan 盒按列均分，两列 left/width 不同', () => {
    const t = makeRect(0, 0, 200, 40)
    const cells: MappedCellGeom[] = [
      { mapLeft: 0, mapRight: 2, mapTop: 0, mapBottom: 1, rect: makeRect(0, 0, 200, 40) },
    ]
    const sliced = sliceMapColRects(t, 2, cells)
    expect(sliced).toHaveLength(2)
    expect(sliced[0]).toEqual(makeRect(0, 0, 100, 40))
    expect(sliced[1]).toEqual(makeRect(100, 0, 100, 40))
    expect(sliced[0]!.left).not.toBe(sliced[1]!.left)
    expect(sliced[0]!.width).toBe(sliced[1]!.width)
  })

  it('无 html 行时 rowspan 盒按行切开，两行 top/height 不同', () => {
    const t = makeRect(0, 0, 100, 80)
    const cells: MappedCellGeom[] = [
      { mapLeft: 0, mapRight: 1, mapTop: 0, mapBottom: 2, rect: makeRect(0, 0, 100, 80) },
    ]
    const sliced = sliceMapRowRects(t, 2, cells, null)
    expect(sliced).toHaveLength(2)
    expect(sliced[0]).toEqual(makeRect(0, 0, 100, 40))
    expect(sliced[1]).toEqual(makeRect(0, 40, 100, 40))
    expect(sliced[0]!.top).not.toBe(sliced[1]!.top)
  })

  it('html 行数与 map.height 一致时用真实行高，不均分 rowspan 盒', () => {
    const t = makeRect(0, 0, 100, 90)
    const cells: MappedCellGeom[] = [
      { mapLeft: 0, mapRight: 1, mapTop: 0, mapBottom: 2, rect: makeRect(0, 0, 100, 90) },
    ]
    const html = [makeRect(0, 0, 100, 30), makeRect(0, 30, 100, 60)]
    const sliced = sliceMapRowRects(t, 2, cells, html)
    expect(sliced[0]!.height).toBe(30)
    expect(sliced[1]!.height).toBe(60)
    expect(sliced[1]!.top).toBe(30)
  })

  it('同列有 colspan=1 起格时用该格宽度，不把首行 colspan 盒均分', () => {
    const t = makeRect(0, 0, 200, 80)
    const cells: MappedCellGeom[] = [
      { mapLeft: 0, mapRight: 2, mapTop: 0, mapBottom: 1, rect: makeRect(0, 0, 200, 40) },
      { mapLeft: 0, mapRight: 1, mapTop: 1, mapBottom: 2, rect: makeRect(0, 40, 80, 40) },
      { mapLeft: 1, mapRight: 2, mapTop: 1, mapBottom: 2, rect: makeRect(80, 40, 120, 40) },
    ]
    const sliced = sliceMapColRects(t, 2, cells)
    expect(sliced[0]).toEqual(makeRect(0, 0, 80, 80))
    expect(sliced[1]).toEqual(makeRect(80, 0, 120, 80))
  })

  it('仅被左侧 colspan 覆盖的列仍切出独立 left', () => {
    const t = makeRect(10, 20, 180, 50)
    const cells: MappedCellGeom[] = [
      { mapLeft: 0, mapRight: 3, mapTop: 0, mapBottom: 1, rect: makeRect(10, 20, 180, 50) },
    ]
    const sliced = sliceMapColRects(t, 3, cells)
    expect(sliced.map((c) => c.left)).toEqual([10, 70, 130])
    expect(sliced.every((c) => c.width === 60)).toBe(true)
  })
})
