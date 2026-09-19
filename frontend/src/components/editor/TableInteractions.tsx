/**
 * ONES 风格的表格交互（仅编辑态）：
 * 1. 边轨圆点：Hover/光标在表内时左、顶浅灰边轨 + 每行/列圆点；悬停圆点变蓝 +，
 *    点击在该行下方插入行 / 该列右侧插入列，深色 tooltip 提示；
 * 2. 单元格选区（CellSelection，shift+点击 / 鼠标拖选）：
 *    - 整行选中：表格左缘蓝色条 + 删除行按钮；整列选中：顶缘红色条 + 删除列按钮；
 *      点击左/顶边轨（非 +）选中整行/整列；
 *    - 选区上方浮动格式工具栏：文字类型、加粗/斜体/下划线/删除线/高亮/行内代码
 *      （作用于选区内全部文字，跨单元格批量生效）、列表/引用（仅单选单元格）、对齐；
 * 3. 格式菜单（右键单元格 / 选区 ˅ / 工具栏网格按钮打开）：
 *    单元格背景色（色板 + 恢复默认）、合并/拆分单元格、删除所选行/列、
 *    表格设置（首行/首列设为表头、删除表格）。
 * 实现：mousemove 跟踪悬停单元格；editor transaction 跟踪 CellSelection（TableMap 计算
 * 选区矩形与整行/整列覆盖）；UI 全部 portal 到 body、fixed 定位，滚动即隐藏。
 */
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Grid3x3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Plus,
  Quote,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { cn } from '../../lib/utils'
import {
  type HotDot,
  type MappedCellGeom,
  type RailRect,
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
} from './tableRailHit'

/** 选中整行/整列时抑制对应圆点（TableMap 半开区间） */
type RailSuppress = { rowStart?: number; rowEnd?: number; colStart?: number; colEnd?: number }

/** 单元格范围（文档坐标） */
interface CellRange {
  from: number
  to: number
}

/** 视口矩形（plain object，便于存 state） */
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** 边轨测量结果（几何 + 当前悬停圆点） */
interface RailUI {
  table: RailRect
  rows: RailRect[]
  cols: RailRect[]
  cellFromByRow: number[]
  cellFromByCol: number[]
  hotDot: HotDot | null
}

/** CellSelection 派生信息（渲染蓝色条 / 行列图标按钮 / 工具栏） */
interface SelInfo {
  /** 选区单元格的并集视口矩形 */
  union: Rect
  /** 所在表格的视口矩形 */
  table: Rect
  /** TableMap 选区矩形（半开区间，供圆点抑制） */
  mapRect: { left: number; right: number; top: number; bottom: number }
  /** 选区覆盖整行（可整行删除，显示左缘行条与按钮） */
  fullRows: boolean
  /** 选区覆盖整列 */
  fullCols: boolean
  /** 选区内不重复单元格数 */
  cellCount: number
  /** 是否仅选中单个单元格（列表/引用按钮可用性） */
  single: boolean
  /** 选区内存在合并单元格（可拆分） */
  canSplit: boolean
  /** 表格首行是表头 */
  firstRowHeader: boolean
  /** 表格首列是表头 */
  firstColHeader: boolean
  /** 锚单元格首个块类型（p / h1..h5），工具栏文字类型回显 */
  firstBlock: string
  /** 各行内 mark 是否「全部命中」（工具栏按钮激活态） */
  marks: Record<string, boolean>
  /** 锚单元格背景色（菜单色板当前色回显） */
  anchorBg: string | null | undefined
  /** 锚单元格段落/标题对齐（工具栏对齐图标回显） */
  textAlign: string | null
}

const MENU_WIDTH = 200
/** 主菜单实际高度约 240px（不含子面板），过大会误判溢出并跳到视口顶部 */
const MENU_EST_HEIGHT = 260
const BG_PANEL_WIDTH = 248
const SETTINGS_PANEL_WIDTH = 150
const VIEWPORT_PAD = 8
const MENU_GAP = 6

type MenuPlacement = 'below' | 'above' | 'right'

/** 菜单紧贴锚点展开，仅在必要时贴视口边缘，避免整页跳到顶部 */
function fitMenuNearAnchor(
  anchor: { left: number; top: number; right: number; bottom: number },
  w: number,
  h: number,
  placement: MenuPlacement,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = VIEWPORT_PAD
  const g = MENU_GAP

  let left: number
  let top: number

  if (placement === 'right') {
    left = anchor.right + g
    top = anchor.top
    if (left + w > vw - pad) left = anchor.left - w - g
    left = Math.max(pad, Math.min(left, vw - w - pad))
    top = Math.max(pad, Math.min(top, vh - h - pad))
    return { left, top }
  }

  left = anchor.left
  if (left + w > vw - pad) left = Math.max(pad, anchor.right - w)
  left = Math.max(pad, Math.min(left, vw - w - pad))

  const below = anchor.bottom + g
  const above = anchor.top - h - g
  const fitsBelow = below + h <= vh - pad
  const fitsAbove = above >= pad

  if (placement === 'below') {
    if (fitsBelow) top = below
    else if (fitsAbove) top = above
    else if (vh - pad - below >= above + h - pad) top = Math.max(pad, vh - h - pad)
    else top = pad
  } else {
    if (fitsAbove) top = above
    else if (fitsBelow) top = below
    else if (above >= pad) top = above
    else top = Math.max(pad, vh - h - pad)
  }

  return { left, top }
}

/** 子面板空间不足时翻到主菜单另一侧 */
function subpanelExpandSide(menuLeft: number, menuWidth: number, panelWidth: number): 'left' | 'right' {
  const rightSpace = window.innerWidth - (menuLeft + menuWidth + VIEWPORT_PAD)
  const leftSpace = menuLeft - VIEWPORT_PAD
  if (rightSpace >= panelWidth) return 'right'
  if (leftSpace >= panelWidth) return 'left'
  return rightSpace >= leftSpace ? 'right' : 'left'
}

/** 格式菜单 */
interface MenuUI {
  x: number
  y: number
  /** 右键打开时来源单元格（无 CellSelection 时操作落点）；图标按钮打开时为 null */
  cell: CellRange | null
}

/** 工具栏批量判断的行内 mark 集合 */
const MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'highlight', 'code'] as const

/** 单元格背景色板（首个 null = 无背景斜线块） */
const CELL_BG_COLORS: (string | null)[] = [
  null,
  '#fde8e8',
  '#fdebd3',
  '#fdf3d1',
  '#ddf3e2',
  '#ddebfd',
  '#e8e3fb',
  '#e5e7eb',
  '#9ca3af',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#a78bfa',
]

/** 找到 pos 所在单元格范围（向上找 tableCell/tableHeader 层） */
function cellRangeAt(editor: Editor, pos: number): CellRange | null {
  const $pos = editor.state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') {
      return { from: $pos.before(d), to: $pos.after(d) }
    }
  }
  return null
}

function clientRect(el: HTMLElement): RailRect {
  const r = el.getBoundingClientRect()
  return makeRect(r.left, r.top, r.width, r.height)
}

/** PM table 节点 DOM 可能是 `.tableWrapper`，边轨/选区条统一用内层 `<table>` 视口矩形 */
function innerTableElement(nodeDom: HTMLElement | null | undefined): HTMLTableElement | null {
  if (!nodeDom) return null
  if (nodeDom instanceof HTMLTableElement) return nodeDom
  const inner = nodeDom.querySelector('table')
  return inner instanceof HTMLTableElement ? inner : null
}

function htmlRowRectsIfMapped(tableEl: HTMLTableElement, mapHeight: number): RailRect[] | null {
  if (tableEl.rows.length !== mapHeight || mapHeight === 0) return null
  const rects: RailRect[] = []
  for (let r = 0; r < mapHeight; r++) {
    const rowEl = tableEl.rows.item(r)
    if (!rowEl) return null
    rects.push(clientRect(rowEl))
  }
  return rects
}

function collectMappedCells(editor: Editor, tablePos: number, map: TableMap): MappedCellGeom[] {
  const seen = new Set<number>()
  const cells: MappedCellGeom[] = []
  for (const offset of map.map) {
    if (seen.has(offset)) continue
    seen.add(offset)
    let box: { left: number; right: number; top: number; bottom: number }
    try {
      box = map.findCell(offset)
    } catch {
      continue
    }
    const dom = editor.view.nodeDOM(tablePos + 1 + offset) as HTMLElement | null
    const cellEl = (dom?.closest?.('td, th') ?? dom) as HTMLElement | null
    if (!cellEl) continue
    const rect = clientRect(cellEl)
    if (rect.width === 0 && rect.height === 0) continue
    cells.push({
      mapLeft: box.left,
      mapRight: box.right,
      mapTop: box.top,
      mapBottom: box.bottom,
      rect,
    })
  }
  return cells
}

function coveringCellPos(tablePos: number, map: TableMap, row: number, col: number): number {
  return tablePos + 1 + map.map[row * map.width + col]
}

/** 光标或坐标所在 table 的文档 pos；没有则 null */
function tablePosAt(editor: Editor, pos: number): number | null {
  const $pos = editor.state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') return $pos.before(d)
  }
  return null
}

/**
 * posAtCoords / 光标都不在表内时：扫描编辑器 PM DOM 里的 table，
 * 用热区（含 28px gutter）命中，再 posAtDOM 取文档位置。
 */
export function tablePosFromDomHitArea(editor: Editor, x: number, y: number): number | null {
  const tables = editor.view.dom.querySelectorAll('table')
  for (const node of tables) {
    const tableEl = node as HTMLElement
    if (!isInTableHitArea(clientRect(tableEl), x, y)) continue
    try {
      const pos = editor.view.posAtDOM(tableEl, 0)
      const tablePos = tablePosAt(editor, pos) ?? tablePosAt(editor, Math.max(0, pos - 1))
      if (tablePos != null) return tablePos
    } catch {
      // 节点未挂进 view 时 posAtDOM 会抛
    }
  }
  return null
}

/** 解析边轨目标表：先 posAtCoords / 光标，再 DOM 热区扫描，最后 lastTablePos */
export function resolveRailTablePosCandidates(
  editor: Editor,
  x: number,
  y: number,
  fallbackTablePos: number | null,
): number[] {
  const cursorTablePos = tablePosAt(editor, editor.state.selection.from)
  const coords = editor.view.posAtCoords({ left: x, top: y })
  const fromCoords = coords ? tablePosAt(editor, coords.pos) : null
  const fromDom =
    fromCoords == null && cursorTablePos == null ? tablePosFromDomHitArea(editor, x, y) : null
  const candidates: number[] = []
  for (const p of [fromCoords, cursorTablePos, fromDom, fallbackTablePos]) {
    if (p != null && !candidates.includes(p)) candidates.push(p)
  }
  return candidates
}

function suppressFromSel(sel: SelInfo | null): RailSuppress | undefined {
  if (!sel) return undefined
  const s: RailSuppress = {}
  if (sel.fullRows) {
    s.rowStart = sel.mapRect.top
    s.rowEnd = sel.mapRect.bottom
  }
  if (sel.fullCols) {
    s.colStart = sel.mapRect.left
    s.colEnd = sel.mapRect.right
  }
  return s.rowStart != null || s.colStart != null ? s : undefined
}

function selectRowOrCol(editor: Editor, cellFrom: number, kind: 'row' | 'col') {
  const $cell = editor.state.doc.resolve(cellFrom)
  const selection =
    kind === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
}

function measureRail(
  editor: Editor,
  tablePos: number,
  x: number,
  y: number,
  suppress?: RailSuppress,
): RailUI | null {
  const tableNode = editor.state.doc.nodeAt(tablePos)
  if (!tableNode || tableNode.type.name !== 'table') return null
  const tableEl = innerTableElement(editor.view.nodeDOM(tablePos) as HTMLElement | null)
  if (!tableEl) return null
  const table = clientRect(tableEl)
  const map = TableMap.get(tableNode)
  const cells = collectMappedCells(editor, tablePos, map)
  const rows = sliceMapRowRects(table, map.height, cells, htmlRowRectsIfMapped(tableEl, map.height))
  const cols = sliceMapColRects(table, map.width, cells)
  const cellFromByRow: number[] = []
  const cellFromByCol: number[] = []
  if (map.width > 0) {
    for (let r = 0; r < map.height; r++) {
      cellFromByRow.push(coveringCellPos(tablePos, map, r, 0))
    }
  }
  if (map.height > 0) {
    for (let c = 0; c < map.width; c++) {
      cellFromByCol.push(coveringCellPos(tablePos, map, 0, c))
    }
  }
  const hotDot = hitHotDot(table, rows, cols, x, y, suppress)
  return { table, rows, cols, cellFromByRow, cellFromByCol, hotDot }
}

function resolveRail(
  editor: Editor,
  x: number,
  y: number,
  fallbackTablePos: number | null,
  suppress?: RailSuppress,
): { rail: RailUI; tablePos: number } | null {
  const cursorTablePos = tablePosAt(editor, editor.state.selection.from)
  const candidates = resolveRailTablePosCandidates(editor, x, y, fallbackTablePos)
  let shown: { rail: RailUI; tablePos: number } | null = null
  for (const tablePos of candidates) {
    const measured = measureRail(editor, tablePos, x, y, suppress)
    if (!measured) continue
    const inHit = isInTableHitArea(measured.table, x, y)
    if (!shouldShowRails(inHit, cursorTablePos === tablePos)) continue
    if (inHit) return { rail: measured, tablePos }
    if (!shown) shown = { rail: measured, tablePos }
  }
  return shown
}

function resolveRailWithoutPointer(
  editor: Editor,
  suppress?: RailSuppress,
): { rail: RailUI; tablePos: number } | null {
  const cursorTablePos = tablePosAt(editor, editor.state.selection.from)
  if (cursorTablePos == null) return null
  const preview = measureRail(editor, cursorTablePos, 0, 0, suppress)
  if (!preview) return null
  const x = preview.table.left + preview.table.width / 2
  const y = preview.table.top + preview.table.height / 2
  const rail = measureRail(editor, cursorTablePos, x, y, suppress)
  if (!rail) return null
  return { rail, tablePos: cursorTablePos }
}

/** 从当前 CellSelection 派生渲染信息（非单元格选区 / 异常时返回 null） */
function computeSelInfo(editor: Editor): SelInfo | null {
  try {
    const { state } = editor
    const sel = state.selection
    if (!(sel instanceof CellSelection)) return null
    const $anchor = sel.$anchorCell
    let tableDepth = -1
    for (let d = $anchor.depth; d > 0; d--) {
      if ($anchor.node(d).type.name === 'table') {
        tableDepth = d
        break
      }
    }
    if (tableDepth < 0) return null
    const tablePos = $anchor.before(tableDepth)
    const tableNode = $anchor.node(tableDepth)
    const map = TableMap.get(tableNode)
    const rel = (p: number) => p - tablePos - 1
    const ra = map.findCell(rel(sel.$anchorCell.pos))
    const rh = map.findCell(rel(sel.$headCell.pos))
    const rect = {
      left: Math.min(ra.left, rh.left),
      right: Math.max(ra.right, rh.right),
      top: Math.min(ra.top, rh.top),
      bottom: Math.max(ra.bottom, rh.bottom),
    }
    const fullRows = rect.left === 0 && rect.right === map.width
    const fullCols = rect.top === 0 && rect.bottom === map.height

    // 遍历选区单元格：去重计数 / 合并检测 / mark 统计 / 首块类型 / 锚单元格背景
    const seen = new Set<number>()
    let cellCount = 0
    let canSplit = false
    let firstBlock = 'p'
    let anchorBg: string | null | undefined
    let textAlign: string | null = null
    const markTotals: Record<string, { t: number; m: number }> = {}
    sel.forEachCell((cell, pos) => {
      if (!seen.has(pos)) {
        seen.add(pos)
        cellCount++
        if (cell.attrs.colSpan > 1 || cell.attrs.rowSpan > 1) canSplit = true
        const first = cell.firstChild
        if (first && seen.size === 1) {
          firstBlock = first.type.name === 'heading' ? `h${first.attrs.level ?? 1}` : 'p'
          anchorBg = cell.attrs.backgroundColor ?? null
          textAlign = first.attrs.textAlign ?? null
        }
      }
      cell.descendants((n) => {
        if (!n.isText) return
        for (const m of MARK_NAMES) {
          const mt = state.schema.marks[m]
          if (!mt) continue
          const e = (markTotals[m] ??= { t: 0, m: 0 })
          e.t++
          if (mt.isInSet(n.marks)) e.m++
        }
      })
    })

    // 选区并集视口矩形（按不重复单元格 DOM 求并；独立去重，勿与上面 forEachCell 的 seen 混用）
    let l = 0
    let t = 0
    let r = 0
    let b = 0
    let has = false
    const domSeen = new Set<number>()
    for (let row = rect.top; row < rect.bottom; row++) {
      for (let col = rect.left; col < rect.right; col++) {
        const p = tablePos + 1 + map.positionAt(row, col, tableNode)
        if (domSeen.has(p)) continue
        domSeen.add(p)
        const dom = editor.view.nodeDOM(p) as HTMLElement | null
        const dr = dom?.getBoundingClientRect()
        if (!dr || (dr.width === 0 && dr.height === 0)) continue
        if (!has) {
          l = dr.left
          t = dr.top
          r = dr.right
          b = dr.bottom
          has = true
        } else {
          l = Math.min(l, dr.left)
          t = Math.min(t, dr.top)
          r = Math.max(r, dr.right)
          b = Math.max(b, dr.bottom)
        }
      }
    }
    if (!has) return null

    const tableEl = innerTableElement(editor.view.nodeDOM(tablePos) as HTMLElement | null)
    const tr = tableEl?.getBoundingClientRect()
    if (!tr || (tr.width === 0 && tr.height === 0)) return null

    const firstRowHeader = tableNode.firstChild?.firstChild?.type.name === 'tableHeader'
    let firstColHeader = tableNode.childCount > 0
    tableNode.forEach((row) => {
      const c0 = row.firstChild
      if (!c0 || c0.type.name !== 'tableHeader') firstColHeader = false
    })

    const marks: Record<string, boolean> = {}
    for (const m of MARK_NAMES) {
      const e = markTotals[m]
      marks[m] = !!e && e.t > 0 && e.m === e.t
    }

    return {
      union: { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t },
      table: { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom, width: tr.width, height: tr.height },
      mapRect: rect,
      fullRows,
      fullCols,
      cellCount,
      single: cellCount === 1,
      canSplit,
      firstRowHeader,
      firstColHeader,
      firstBlock,
      marks,
      anchorBg,
      textAlign,
    }
  } catch {
    return null
  }
}

export default function TableInteractions({ editor }: { editor: Editor }) {
  const [rail, setRail] = useState<RailUI | null>(null)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const lastTablePosRef = useRef<number | null>(null)
  // CellSelection 派生信息
  const [sel, setSel] = useState<SelInfo | null>(null)
  const selRef = useRef<SelInfo | null>(null)
  selRef.current = sel
  // 格式菜单（右键 / 行列图标按钮 / 工具栏网格按钮）
  const [menu, setMenu] = useState<MenuUI | null>(null)
  // 菜单内展开的子面板
  const [panel, setPanel] = useState<'bg' | 'settings' | null>(null)
  // 工具栏对齐下拉
  const [alignOpen, setAlignOpen] = useState(false)

  /* ── 悬停跟踪：mousemove 维护边轨 / hotDot（不因 [data-ti-rail] 丢掉坐标） ── */
  useEffect(() => {
    if (!editor) return
    const apply = (resolved: { rail: RailUI; tablePos: number } | null) => {
      lastTablePosRef.current = resolved?.tablePos ?? null
      setRail(resolved?.rail ?? null)
    }
    const onMove = (e: MouseEvent) => {
      if (!editor.isEditable) return
      const t = e.target as HTMLElement
      if (t.closest?.('[data-ti-menu], [data-ti-toolbar]')) return
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      apply(resolveRail(editor, e.clientX, e.clientY, lastTablePosRef.current, suppressFromSel(selRef.current)))
    }

    // 右键：表格内接管为格式菜单
    const onCtx = (e: MouseEvent) => {
      const cellEl = (e.target as HTMLElement).closest?.('.ProseMirror td, .ProseMirror th')
      if (!cellEl) return
      e.preventDefault()
      const result = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      const cell = result ? cellRangeAt(editor, result.pos) : null
      if (!cell) return
      setPanel(null)
      const anchor = { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }
      const { left, top } = fitMenuNearAnchor(anchor, MENU_WIDTH, MENU_EST_HEIGHT, 'below')
      setMenu({ x: left, y: top, cell })
    }

    document.addEventListener('mousemove', onMove)
    editor.view.dom.addEventListener('contextmenu', onCtx)
    return () => {
      document.removeEventListener('mousemove', onMove)
      editor.view.dom.removeEventListener('contextmenu', onCtx)
    }
  }, [editor])

  /* ── CellSelection 跟踪：事务里按选区签名重算派生信息；同步刷新边轨 ── */
  useEffect(() => {
    if (!editor) return
    let lastSig = ''
    let lastDoc = editor.state.doc
    const applyRail = (resolved: { rail: RailUI; tablePos: number } | null) => {
      lastTablePosRef.current = resolved?.tablePos ?? null
      setRail(resolved?.rail ?? null)
    }
    const refreshRail = (info: SelInfo | null = selRef.current) => {
      if (!editor.isEditable) {
        applyRail(null)
        return
      }
      const pointer = lastPointerRef.current
      const suppress = suppressFromSel(info)
      applyRail(
        pointer
          ? resolveRail(editor, pointer.x, pointer.y, lastTablePosRef.current, suppress)
          : resolveRailWithoutPointer(editor, suppress),
      )
    }
    const update = () => {
      const s = editor.state.selection
      const isCell = s instanceof CellSelection
      const sig = isCell ? `${s.from}:${s.to}` : ''
      if (sig === lastSig && editor.state.doc === lastDoc) {
        refreshRail()
        return
      }
      lastSig = sig
      lastDoc = editor.state.doc
      const nextSel = isCell ? computeSelInfo(editor) : null
      selRef.current = nextSel
      setSel(nextSel)
      if (!isCell) setAlignOpen(false)
      refreshRail(nextSel)
    }
    update()
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    // 滚动后坐标失效：隐藏选区浮层与菜单（重新选择即再现）
    const onScroll = () => {
      selRef.current = null
      setSel(null)
      setRail(null)
      lastTablePosRef.current = null
      lastPointerRef.current = null
      setMenu(null)
      lastSig = ''
    }
    const onResize = () => onScroll()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [editor])

  /* ── 菜单打开时：点击外部 / Esc 关闭 ── */
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-ti-menu]')) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!editor || !editor.isEditable) return null

  /* ── 命令辅助 ── */

  /** 把选区设置到目标单元格内容起点，再执行命令 */
  const runAt = (cell: CellRange, run: () => void) => {
    editor.commands.setTextSelection({ from: cell.from + 1, to: cell.from + 1 })
    run()
  }

  /** 有 CellSelection 直接作用选区（支持删所选多行/列）；否则落到来源单元格 */
  const withCellContext = (run: () => void) => {
    if (editor.state.selection instanceof CellSelection || !menu?.cell) run()
    else runAt(menu.cell, run)
  }

  /**
   * 删行/列后 PM 会把 CellSelection 映射到相邻行/列；折叠为单元格内文本光标，取消整行/列高亮。
   */
  const deleteTableAxis = (axis: 'row' | 'col') => {
    withCellContext(() => {
      const ok =
        axis === 'row'
          ? editor.chain().focus().deleteRow().run()
          : editor.chain().focus().deleteColumn().run()
      if (!ok) return
      const { selection } = editor.state
      if (selection instanceof CellSelection) {
        editor.commands.setTextSelection(selection.$anchorCell.pos + 1)
      }
    })
  }

  /** 行内 mark 批量开关：全部带 mark → 移除；否则全部添加 */
  const toggleMarkInCells = (name: string) => {
    const { state, view } = editor
    const selC = state.selection
    if (!(selC instanceof CellSelection)) return
    const mt = state.schema.marks[name]
    if (!mt) return
    let total = 0
    let marked = 0
    selC.forEachCell((cell) => {
      cell.descendants((n) => {
        if (!n.isText) return
        total++
        if (mt.isInSet(n.marks)) marked++
      })
    })
    if (total === 0) return
    const apply = marked < total
    const tr = state.tr
    selC.forEachCell((cell, pos) => {
      cell.descendants((n, off) => {
        if (!n.isText) return
        const from = pos + off
        const to = from + (n.text?.length ?? 0)
        if (apply) tr.addMark(from, to, mt.create())
        else tr.removeMark(from, to, mt)
      })
    })
    view.dispatch(tr.scrollIntoView())
  }

  /** 文字类型批量设置（仅转换单元格直接子级的段落/标题，保留对齐） */
  const setBlockInCells = (kind: string) => {
    const { state, view } = editor
    const selC = state.selection
    if (!(selC instanceof CellSelection)) return
    const para = state.schema.nodes.paragraph
    const heading = state.schema.nodes.heading
    if (!para) return
    const tr = state.tr
    selC.forEachCell((cell, cellPos) => {
      cell.forEach((n, off) => {
        if (n.type.name !== 'paragraph' && n.type.name !== 'heading') return
        const blockPos = cellPos + 1 + off
        const textAlign = n.attrs.textAlign != null ? { textAlign: n.attrs.textAlign } : {}
        if (kind === 'p') tr.setNodeMarkup(blockPos, para, textAlign)
        else if (heading) tr.setNodeMarkup(blockPos, heading, { level: Number(kind[1]), ...textAlign })
      })
    })
    view.dispatch(tr.scrollIntoView())
  }

  /** 对齐批量设置（单元格直接子级段落/标题） */
  const setAlignInCells = (align: string) => {
    const { state, view } = editor
    const selC = state.selection
    if (!(selC instanceof CellSelection)) return
    const tr = state.tr
    selC.forEachCell((cell, cellPos) => {
      cell.forEach((n, off) => {
        if (n.type.name !== 'paragraph' && n.type.name !== 'heading') return
        tr.setNodeMarkup(cellPos + 1 + off, undefined, { ...n.attrs, textAlign: align })
      })
    })
    view.dispatch(tr.scrollIntoView())
  }

  /** 单元格内首个块级节点的文本光标（段落/标题内，非 cell 边界） */
  const cursorInCell = (cellPos: number) => {
    const cell = editor.state.doc.nodeAt(cellPos)
    if (!cell?.firstChild) return cellPos + 1
    return cellPos + 2
  }

  /** 列表/引用：仅单选单元格可用（光标落入段落后走常规命令，同 BlockHandle） */
  const singleCellBlock = (kind: 'bullet' | 'ordered' | 'task' | 'quote') => {
    const selC = editor.state.selection
    if (!(selC instanceof CellSelection)) return
    const cursor = cursorInCell(selC.$anchorCell.pos)
    editor.commands.setTextSelection({ from: cursor, to: cursor })
    switch (kind) {
      case 'bullet':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'ordered':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'task':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'quote':
        editor.chain().focus().toggleBlockquote().run()
        break
    }
  }

  /** 单元格背景色：作用于选区内全部单元格 */
  const applyBg = (color: string | null) => {
    const run = () => {
      editor.chain().focus().updateAttributes('tableCell', { backgroundColor: color }).run()
      editor.chain().focus().updateAttributes('tableHeader', { backgroundColor: color }).run()
    }
    withCellContext(run)
  }

  /** 无 CellSelection 时（右键落点）判断该单元格是否为合并单元格 */
  const targetCellHasMerge = () => {
    if (!menu?.cell) return false
    const n = editor.state.doc.nodeAt(menu.cell.from)
    return !!n && ((n.attrs.colSpan ?? 1) > 1 || (n.attrs.rowSpan ?? 1) > 1)
  }

  /** 表头状态（无选区时从右键落点单元格所在表格推断） */
  const headerState = (): { row: boolean; col: boolean } => {
    if (sel) return { row: sel.firstRowHeader, col: sel.firstColHeader }
    if (!menu?.cell) return { row: false, col: false }
    try {
      const $ = editor.state.doc.resolve(menu.cell.from + 1)
      for (let d = $.depth; d > 0; d--) {
        if ($.node(d).type.name !== 'table') continue
        const t = $.node(d)
        const row = t.firstChild?.firstChild?.type.name === 'tableHeader'
        let col = t.childCount > 0
        t.forEach((r) => {
          const c0 = r.firstChild
          if (!c0 || c0.type.name !== 'tableHeader') col = false
        })
        return { row, col }
      }
    } catch {
      // 解析失败按未设置处理
    }
    return { row: false, col: false }
  }

  /** 关闭菜单并执行命令 */
  const op = (run: () => void) => {
    run()
    setMenu(null)
    setPanel(null)
  }

  /** 从触发元素旁打开菜单（行/列图标：右侧；顶缘/工具栏/˅：下方或上方） */
  const openMenuFrom = (
    el: HTMLElement,
    placement: MenuPlacement,
    cell: CellRange | null,
  ) => {
    const r = el.getBoundingClientRect()
    setPanel(null)
    const { left, top } = fitMenuNearAnchor(r, MENU_WIDTH, MENU_EST_HEIGHT, placement)
    setMenu({ x: left, y: top, cell })
  }

  /* ── 渲染 ── */

  const divider = <span className="mx-0.5 h-4 w-px bg-slate-200" />

  const iconBtn = (
    title: string,
    active: boolean | undefined,
    children: React.ReactNode,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100',
        active && 'bg-blue-50 text-blue-600 hover:bg-blue-50',
        disabled && 'cursor-not-allowed text-slate-300 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  )

  // 菜单项（danger 红色 hover；disabled 置灰）
  const menuItem = (label: string, onClick: () => void, opts?: { disabled?: boolean; danger?: boolean; checked?: boolean }) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors',
        opts?.disabled
          ? 'cursor-not-allowed text-slate-300'
          : opts?.danger
            ? 'text-slate-600 hover:bg-red-50 hover:text-red-500'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      {label}
      {opts?.checked && <Check size={13} className="text-blue-500" />}
    </button>
  )

  // 工具栏位置：整列选中时贴表格顶缘内侧（列图标按钮下方，参考截图 3）；
  // 其余（整行/部分选区）悬浮于选区上方，贴顶时移到选区下方
  const tb = sel
    ? {
        left: Math.min(Math.max(sel.union.left + sel.union.width / 2, 150), window.innerWidth - 150),
        top: sel.fullCols
          ? sel.table.top + 24
          : sel.union.top - 44 < 6
            ? sel.union.bottom + 8
            : sel.union.top - 44,
      }
    : null

  const headers = menu ? headerState() : { row: false, col: false }
  const canMerge = !!sel && sel.cellCount > 1
  const canSplit = sel ? sel.canSplit : targetCellHasMerge()
  const menuBg = sel?.anchorBg ?? null
  const railSuppress = suppressFromSel(sel)
  const menuPos = menu ? { left: menu.x, top: menu.y } : null
  const bgPanelSide =
    menuPos != null ? subpanelExpandSide(menuPos.left, MENU_WIDTH, BG_PANEL_WIDTH) : 'right'
  const settingsPanelSide =
    menuPos != null ? subpanelExpandSide(menuPos.left, MENU_WIDTH, SETTINGS_PANEL_WIDTH) : 'right'
  const alignIcon =
    sel?.textAlign === 'center' ? (
      <AlignCenter size={14} />
    ) : sel?.textAlign === 'right' ? (
      <AlignRight size={14} />
    ) : (
      <AlignLeft size={14} />
    )

  const onRailMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!rail) return
    if (e.target instanceof Element && e.target.closest('button')) return
    const hit = hitRailSegment(rail.table, rail.rows, rail.cols, e.clientX, e.clientY, suppressFromSel(sel))
    if (!hit) return
    const from = hit.kind === 'row' ? rail.cellFromByRow[hit.index] : rail.cellFromByCol[hit.index]
    if (from == null) return
    selectRowOrCol(editor, from, hit.kind)
  }

  return createPortal(
    <>
      {/* 1. 边轨 + 圆点；悬停圆点变蓝 + 插入行/列 */}
      {rail && !menu && (
        <>
          <div
            data-ti
            data-ti-rail="row"
            className="pointer-events-auto fixed z-[61] rounded-sm bg-slate-200/90"
            style={{
              left: rail.table.left - 14,
              top: rail.table.top,
              width: 8,
              height: rail.table.height,
            }}
            onMouseDown={onRailMouseDown}
          />
          <div
            data-ti
            data-ti-rail="col"
            className="pointer-events-auto fixed z-[61] rounded-sm bg-slate-200/90"
            style={{
              left: rail.table.left,
              top: rail.table.top - 14,
              width: rail.table.width,
              height: 8,
            }}
            onMouseDown={onRailMouseDown}
          />
          {rail.rows.map((row, index) => {
            if (isDotSuppressed('row', index, railSuppress)) return null
            const hot = rail.hotDot?.kind === 'row' && rail.hotDot.index === index
            const pos = rowDotPos(rail.table, row)
            if (hot) {
              return (
                <div
                  key={`r-${index}`}
                  data-ti
                  className="group fixed z-[62]"
                  style={{ left: pos.x - 10, top: pos.y - 10 }}
                >
                  <span className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800/95 px-2 py-1 text-[11px] text-white shadow group-hover:block">
                    插入行
                  </span>
                  <button
                    type="button"
                    title="插入行"
                    className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500 text-white shadow-md transition-transform hover:scale-110 hover:bg-blue-600"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const from = rail.cellFromByRow[index]
                      if (from == null) return
                      runAt({ from, to: from + 1 }, () => editor.chain().focus().addRowAfter().run())
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )
            }
            return (
              <div
                key={`r-${index}`}
                data-ti
                className="pointer-events-none fixed z-[62] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400"
                style={{ left: pos.x, top: pos.y }}
              />
            )
          })}
          {rail.cols.map((col, index) => {
            if (isDotSuppressed('col', index, railSuppress)) return null
            const hot = rail.hotDot?.kind === 'col' && rail.hotDot.index === index
            const pos = colDotPos(rail.table, col)
            if (hot) {
              return (
                <div
                  key={`c-${index}`}
                  data-ti
                  className="group fixed z-[62]"
                  style={{ left: pos.x - 10, top: pos.y - 10 }}
                >
                  <button
                    type="button"
                    title="插入列"
                    className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500 text-white shadow-md transition-transform hover:scale-110 hover:bg-blue-600"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const from = rail.cellFromByCol[index]
                      if (from == null) return
                      runAt({ from, to: from + 1 }, () => editor.chain().focus().addColumnAfter().run())
                    }}
                  >
                    <Plus size={13} />
                  </button>
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800/95 px-2 py-1 text-[11px] text-white shadow group-hover:block">
                    插入列
                  </span>
                </div>
              )
            }
            return (
              <div
                key={`c-${index}`}
                data-ti
                className="pointer-events-none fixed z-[62] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400"
                style={{ left: pos.x, top: pos.y }}
              />
            )
          })}
        </>
      )}

      {/* 2. 选区装饰：整行蓝条 / 整列红条 + 删除行/列按钮 */}
      {sel && sel.fullRows && (
        <>
          <div
            data-ti
            className="fixed z-[61] rounded-sm bg-blue-500"
            style={{ left: sel.table.left - 3, top: sel.union.top, width: 3, height: sel.union.height }}
          />
          <button
            data-ti
            type="button"
            title="删除所选行"
            className="fixed z-[66] flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            style={{ left: Math.max(4, sel.table.left - 44), top: sel.union.top + sel.union.height / 2 - 16 }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteTableAxis('row')}
          >
            <Trash2 size={17} />
          </button>
        </>
      )}
      {sel && sel.fullCols && (
        <>
          <div
            data-ti
            className="fixed z-[61] rounded-sm bg-red-500"
            style={{ left: sel.union.left, top: sel.table.top - 3, width: sel.union.width, height: 3 }}
          />
          <button
            data-ti
            type="button"
            title="删除所选列"
            className="fixed z-[66] flex h-8 w-8 items-center justify-center rounded-lg border border-red-400 bg-white text-slate-500 shadow-md transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            style={{ left: sel.union.left + sel.union.width / 2 - 16, top: Math.max(4, sel.table.top - 44) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteTableAxis('col')}
          >
            <Trash2 size={17} />
          </button>
        </>
      )}

      {/* 2.5 选区右上角「˅」触发钮：打开格式菜单（参考截图 5） */}
      {sel && !menu && (
        <button
          data-ti
          type="button"
          title="表格操作"
          className="fixed z-[66] flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:text-blue-600"
          style={{ left: sel.union.right - 26, top: sel.union.top + 4 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => openMenuFrom(e.currentTarget, 'below', null)}
        >
          <ChevronDown size={14} />
        </button>
      )}

      {/* 3. 选区浮动格式工具栏 */}
      {sel && tb && !menu && (
        <div
          data-ti
          data-ti-toolbar
          className="fixed z-[65] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
          style={{ left: tb.left, top: tb.top, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {iconBtn('表格菜单', false, <Grid3x3 size={15} />, (e) => openMenuFrom(e.currentTarget, 'below', null))}
          {divider}
          <select
            title="文字类型"
            value={sel.firstBlock}
            onChange={(e) => setBlockInCells(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-7 cursor-pointer rounded border-0 bg-transparent pl-1 pr-0 text-xs text-slate-600 outline-none hover:bg-slate-100"
          >
            <option value="p">正文</option>
            <option value="h1">标题 1</option>
            <option value="h2">标题 2</option>
            <option value="h3">标题 3</option>
            <option value="h4">标题 4</option>
            <option value="h5">标题 5</option>
          </select>
          {divider}
          {iconBtn('加粗', sel.marks.bold, <Bold size={14} />, () => toggleMarkInCells('bold'))}
          {iconBtn('斜体', sel.marks.italic, <Italic size={14} />, () => toggleMarkInCells('italic'))}
          {iconBtn('下划线', sel.marks.underline, <UnderlineIcon size={14} />, () => toggleMarkInCells('underline'))}
          {iconBtn('删除线', sel.marks.strike, <Strikethrough size={14} />, () => toggleMarkInCells('strike'))}
          {iconBtn('高亮', sel.marks.highlight, <Highlighter size={14} />, () => toggleMarkInCells('highlight'))}
          {iconBtn('行内代码', sel.marks.code, <Code size={14} />, () => toggleMarkInCells('code'))}
          {divider}
          {iconBtn('无序列表', false, <List size={14} />, () => singleCellBlock('bullet'), !sel.single)}
          {iconBtn('有序列表', false, <ListOrdered size={14} />, () => singleCellBlock('ordered'), !sel.single)}
          {iconBtn('任务列表', false, <ListTodo size={14} />, () => singleCellBlock('task'), !sel.single)}
          {iconBtn('引用', false, <Quote size={14} />, () => singleCellBlock('quote'), !sel.single)}
          {divider}
          <div className="relative">
            {iconBtn('对齐', !!sel.textAlign, alignIcon, () => setAlignOpen((o) => !o))}
            {alignOpen && (
              <div className="absolute left-1/2 top-full z-10 mt-1 w-24 -translate-x-1/2 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {[
                  { k: 'left', icon: <AlignLeft size={13} />, label: '左对齐' },
                  { k: 'center', icon: <AlignCenter size={13} />, label: '居中' },
                  { k: 'right', icon: <AlignRight size={13} />, label: '右对齐' },
                ].map((a) => (
                  <button
                    key={a.k}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAlignInCells(a.k)
                      setAlignOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. 格式菜单：背景色 / 合并拆分 / 删除行列 / 表格设置 */}
      {menu && (
        <div
          data-ti
          data-ti-menu
          className="fixed z-[70] w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          style={{
            top: menuPos!.top,
            left: menuPos!.left,
          }}
          onMouseLeave={() => setPanel(null)}
        >
          {/* 单元格背景色：hover 展开色板 */}
          <div className="relative" onMouseEnter={() => setPanel('bg')}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPanel((p) => (p === 'bg' ? null : 'bg'))}
              className="flex w-full items-center justify-between px-3 py-1.5 text-[13px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              单元格背景色
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-4 w-6 rounded-sm border border-slate-300',
                    !menuBg && 'bg-[linear-gradient(135deg,transparent_45%,#cbd5e1_45%,#cbd5e1_55%,transparent_55%)]',
                  )}
                  style={menuBg ? { backgroundColor: menuBg } : undefined}
                />
                <ChevronRight size={12} className="text-slate-400" />
              </span>
            </button>
            {panel === 'bg' && (
              <div
                data-ti
                className={cn(
                  'absolute top-0 w-[248px] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl',
                  bgPanelSide === 'right' ? 'left-full ml-1' : 'right-full mr-1',
                )}
              >
                <div className="grid grid-cols-7 gap-1.5">
                  {CELL_BG_COLORS.map((c) => (
                    <button
                      key={c ?? 'none'}
                      type="button"
                      title={c ?? '无背景'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => op(() => applyBg(c))}
                      className={cn(
                        'h-6 w-6 rounded border border-slate-200 transition-transform hover:scale-110',
                        !c && 'bg-[linear-gradient(135deg,transparent_45%,#94a3b8_45%,#94a3b8_55%,transparent_55%)]',
                      )}
                      style={c ? { backgroundColor: c } : undefined}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => op(() => applyBg(null))}
                  className="mt-2.5 w-full rounded-md border border-slate-200 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  恢复默认
                </button>
              </div>
            )}
          </div>

          {menuItem('合并单元格', () => op(() => editor.chain().focus().mergeCells().run()), { disabled: !canMerge })}
          {menuItem('拆分单元格', () => op(() => editor.chain().focus().splitCell().run()), { disabled: !canSplit })}

          <div className="my-1 h-px bg-slate-100" />

          {menuItem('删除所选行', () => op(() => deleteTableAxis('row')))}
          {menuItem('删除所选列', () => op(() => deleteTableAxis('col')))}

          <div className="my-1 h-px bg-slate-100" />

          {/* 表格设置：hover 展开子菜单 */}
          <div className="relative" onMouseEnter={() => setPanel('settings')}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
              className="flex w-full items-center justify-between px-3 py-1.5 text-[13px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              表格设置
              <ChevronRight size={12} className="text-slate-400" />
            </button>
            {panel === 'settings' && (
              <div
                data-ti
                className={cn(
                  'absolute top-0 w-[150px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl',
                  settingsPanelSide === 'right' ? 'left-full ml-1' : 'right-full mr-1',
                )}
              >
                {menuItem(
                  '首行设为表头',
                  () => op(() => withCellContext(() => editor.chain().focus().toggleHeaderRow().run())),
                  { checked: headers.row },
                )}
                {menuItem(
                  '首列设为表头',
                  () => op(() => withCellContext(() => editor.chain().focus().toggleHeaderColumn().run())),
                  { checked: headers.col },
                )}
                <div className="my-1 h-px bg-slate-100" />
                {menuItem('删除表格', () => op(() => withCellContext(() => editor.chain().focus().deleteTable().run())), {
                  danger: true,
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
