export interface RailRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type HotDot = { kind: 'row' | 'col'; index: number }

export const RAIL_GUTTER = 28
export const DOT_HIT_RADIUS = 12
export const ROW_DOT_OFFSET_X = 12
export const COL_DOT_OFFSET_Y = 12

export function makeRect(left: number, top: number, width: number, height: number): RailRect {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** TableMap 单元格：半开 map 区间 + DOM 视口矩形（完整 rowspan/colspan 盒） */
export interface MappedCellGeom {
  mapLeft: number
  mapRight: number
  mapTop: number
  mapBottom: number
  rect: RailRect
}

function spanOf(start: number, end: number): number {
  return Math.max(1, end - start)
}

/** 优先「从该 index 起格」的最小 span，否则取覆盖格 */
function pickMappedCell(
  cells: readonly MappedCellGeom[],
  index: number,
  axis: 'row' | 'col',
): MappedCellGeom | undefined {
  let best: MappedCellGeom | undefined
  let bestStarts = false
  let bestSpan = Infinity
  for (const cell of cells) {
    const start = axis === 'row' ? cell.mapTop : cell.mapLeft
    const end = axis === 'row' ? cell.mapBottom : cell.mapRight
    if (start > index || index >= end) continue
    const starts = start === index
    const span = spanOf(start, end)
    if (!best || (starts && !bestStarts) || (starts === bestStarts && span < bestSpan)) {
      best = cell
      bestStarts = starts
      bestSpan = span
    }
  }
  return best
}

/**
 * 每个 map 行一条 rect。`htmlRowRects.length === mapHeight` 时用真实 `<tr>`；
 * 否则按起格/覆盖格切 rowspan 盒，避免多行圆点叠在同一 DOM 矩形上。
 */
export function sliceMapRowRects(
  table: RailRect,
  mapHeight: number,
  cells: readonly MappedCellGeom[],
  htmlRowRects?: readonly RailRect[] | null,
): RailRect[] {
  if (htmlRowRects && htmlRowRects.length === mapHeight) {
    return htmlRowRects.map((r) => makeRect(r.left, r.top, r.width, r.height))
  }
  const rows: RailRect[] = []
  const fallbackH = mapHeight > 0 ? table.height / mapHeight : table.height
  for (let r = 0; r < mapHeight; r++) {
    const cell = pickMappedCell(cells, r, 'row')
    if (cell) {
      const span = spanOf(cell.mapTop, cell.mapBottom)
      const h = cell.rect.height / span
      rows.push(makeRect(table.left, cell.rect.top + (r - cell.mapTop) * h, table.width, h))
    } else {
      rows.push(makeRect(table.left, table.top + r * fallbackH, table.width, fallbackH))
    }
  }
  return rows
}

/**
 * 每个 map 列一条 rect。起格单元格给出该列 left/width；
 * 否则把覆盖的 colspan 盒均分，避免多列圆点叠在同一 DOM 矩形上。
 */
export function sliceMapColRects(
  table: RailRect,
  mapWidth: number,
  cells: readonly MappedCellGeom[],
): RailRect[] {
  const cols: RailRect[] = []
  const fallbackW = mapWidth > 0 ? table.width / mapWidth : table.width
  for (let c = 0; c < mapWidth; c++) {
    const cell = pickMappedCell(cells, c, 'col')
    if (cell) {
      const span = spanOf(cell.mapLeft, cell.mapRight)
      const w = cell.rect.width / span
      cols.push(makeRect(cell.rect.left + (c - cell.mapLeft) * w, table.top, w, table.height))
    } else {
      cols.push(makeRect(table.left + c * fallbackW, table.top, fallbackW, table.height))
    }
  }
  return cols
}

export function isInTableHitArea(table: RailRect, x: number, y: number, gutter = RAIL_GUTTER): boolean {
  return x >= table.left - gutter && x <= table.right + gutter && y >= table.top - gutter && y <= table.bottom + gutter
}

export function shouldShowRails(pointerInHitArea: boolean, cursorInTable: boolean): boolean {
  return pointerInHitArea || cursorInTable
}

/** 行圆点：该行下缘（与下一行交界处；addRowAfter 落点） */
export function rowDotPos(table: RailRect, row: RailRect): { x: number; y: number } {
  return { x: table.left - ROW_DOT_OFFSET_X, y: row.bottom }
}

/** 列圆点：该列右缘（与下一列交界处；addColumnAfter 落点） */
export function colDotPos(table: RailRect, col: RailRect): { x: number; y: number } {
  return { x: col.right, y: table.top - COL_DOT_OFFSET_Y }
}

export function isDotSuppressed(
  kind: 'row' | 'col',
  index: number,
  suppress?: { rowStart?: number; rowEnd?: number; colStart?: number; colEnd?: number },
): boolean {
  if (!suppress) return false
  if (kind === 'row' && suppress.rowStart != null && suppress.rowEnd != null) {
    return index >= suppress.rowStart && index < suppress.rowEnd
  }
  if (kind === 'col' && suppress.colStart != null && suppress.colEnd != null) {
    return index >= suppress.colStart && index < suppress.colEnd
  }
  return false
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export function hitHotDot(
  table: RailRect,
  rows: RailRect[],
  cols: RailRect[],
  x: number,
  y: number,
  suppress?: { rowStart?: number; rowEnd?: number; colStart?: number; colEnd?: number },
): HotDot | null {
  const r2 = DOT_HIT_RADIUS * DOT_HIT_RADIUS
  let best: HotDot | null = null
  let bestD = r2
  const preferRow = x < table.left
  const preferCol = y < table.top
  rows.forEach((row, index) => {
    if (isDotSuppressed('row', index, suppress)) return
    const p = rowDotPos(table, row)
    const d = dist2(x, y, p.x, p.y)
    if (d > bestD) return
    if (d === bestD && best && preferCol && !preferRow) return
    bestD = d
    best = { kind: 'row', index }
  })
  cols.forEach((col, index) => {
    if (isDotSuppressed('col', index, suppress)) return
    const p = colDotPos(table, col)
    const d = dist2(x, y, p.x, p.y)
    if (d > bestD) return
    if (d === bestD && best && preferRow && !preferCol) return
    bestD = d
    best = { kind: 'col', index }
  })
  return best
}

function indexAtY(rows: RailRect[], y: number): number {
  return rows.findIndex((r) => y >= r.top && y < r.bottom)
}

function indexAtX(cols: RailRect[], x: number): number {
  return cols.findIndex((c) => x >= c.left && x < c.right)
}

export function hitRailSegment(
  table: RailRect,
  rows: RailRect[],
  cols: RailRect[],
  x: number,
  y: number,
  suppress?: { rowStart?: number; rowEnd?: number; colStart?: number; colEnd?: number },
): HotDot | null {
  if (x >= table.left - RAIL_GUTTER && x < table.left && y >= table.top && y < table.bottom) {
    const index = indexAtY(rows, y)
    if (index >= 0 && !isDotSuppressed('row', index, suppress)) return { kind: 'row', index }
  }
  if (y >= table.top - RAIL_GUTTER && y < table.top && x >= table.left && x < table.right) {
    const index = indexAtX(cols, x)
    if (index >= 0 && !isDotSuppressed('col', index, suppress)) return { kind: 'col', index }
  }
  return null
}
