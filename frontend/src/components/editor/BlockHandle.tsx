/**
 * 块手柄（仅编辑态）：鼠标悬浮块级节点时左侧显示 ⠿ 手柄。
 * - 点击手柄：弹出块操作菜单（文字类型 / 列表 / 引用 / 对齐 / 复制 / 剪切 / 删除 / 上下插入段落）
 * - 按住手柄拖动：显示插入位置指示线，松开后把块移动到目标位置（支持跨位置移动）
 * 仅处理顶层块（depth=1）；列表项等嵌套块不支持拖拽（菜单内可改类型）。
 */
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ClipboardCopy,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  List,
  ListOrdered,
  ListTodo,
  Plus,
  Quote,
  Scissors,
  Type,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { requestSlashMenu } from './SlashMenu'

/** 块范围（文档坐标） */
interface BlockRange {
  from: number
  to: number
}

/** 手柄状态：屏幕坐标 + 当前块范围 */
interface HandleState {
  top: number
  left: number
  range: BlockRange
  /** 悬浮块是否为空行（空段落/空标题）：空行显示「+」，有内容显示拖拽手柄 */
  empty: boolean
}

/** 插入指示线 */
interface Indicator {
  top: number
  insertPos: number
}

/** 菜单按钮 */
function MenuButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100',
        active && 'bg-blue-50 text-blue-600 hover:bg-blue-50',
      )}
    >
      {children}
    </button>
  )
}

/** 菜单动作行（复制/剪切/删除/插入段落等） */
function MenuAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50',
        danger && 'text-red-500 hover:bg-red-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export default function BlockHandle({ editor }: { editor: Editor }) {
  // 手柄（悬浮块）
  const [handle, setHandle] = useState<HandleState | null>(null)
  // 操作菜单
  const [menuOpen, setMenuOpen] = useState(false)
  // 拖拽指示线
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  // 拖拽中（隐藏块原位置视觉反馈可选，这里仅记录状态）
  const [dragging, setDragging] = useState(false)

  const hoverRangeRef = useRef<(BlockRange & { empty: boolean }) | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean; range: BlockRange } | null>(null)
  const indicatorRef = useRef<Indicator | null>(null)

  /** 由文档坐标取顶层块范围（depth=1），不在顶层块内返回 null */
  const blockRangeAt = (pos: number): BlockRange | null => {
    const $pos = editor.state.doc.resolve(pos)
    if ($pos.depth < 1) return null
    return { from: $pos.before(1), to: $pos.after(1) }
  }

  /** 计算块的屏幕包围盒（视口坐标）；firstLineCenter = 首行垂直中心（手柄对齐用） */
  const blockRect = (
    range: BlockRange
  ): { top: number; left: number; bottom: number; firstLineCenter: number } | null => {
    try {
      const start = editor.view.coordsAtPos(range.from)
      const end = editor.view.coordsAtPos(range.to)
      // 首行中心：coordsAtPos 返回零高光标矩形，改用块元素行盒计算
      // （nodeDOM(from) 精确取块节点 DOM；domAtPos 在块前位置会解析到根容器）
      const blockEl = editor.view.nodeDOM(range.from) as HTMLElement | null
      let firstLineCenter = start.top
      if (blockEl && blockEl.getBoundingClientRect) {
        const style = getComputedStyle(blockEl)
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.75
        const blockTop = blockEl.getBoundingClientRect().top
        firstLineCenter = blockTop + lineHeight / 2
      }
      return {
        top: Math.min(start.top, end.top),
        left: Math.min(start.left, end.left),
        bottom: Math.max(start.bottom, end.bottom),
        firstLineCenter: Math.round(firstLineCenter),
      }
    } catch {
      return null
    }
  }

  // 悬浮跟踪：mousemove 计算当前块并定位手柄
  useEffect(() => {
    if (!editor) return

    const onMove = (e: MouseEvent) => {
      if (dragRef.current) return // 拖拽中不更新手柄
      if (menuOpen) return
      // 指针在手柄/菜单上时冻结当前手柄（否则 posAtCoords 判定在编辑器外会把手柄清掉）
      const t = e.target as HTMLElement
      if (t.closest?.('[data-block-handle-grip],[data-block-handle-plus],[data-block-handle-menu]')) return
      const result = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!result) {
        // 编辑器矩形外扩区域内（左侧留白/手柄/块间空隙）保持手柄，避免移向手柄途中闪烁消失
        const root = editor.view.dom.closest('.wiki-editor')
        if (root) {
          const r = root.getBoundingClientRect()
          const inZone =
            e.clientX >= r.left - 44 && e.clientX <= r.right + 16 &&
            e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8
          if (inZone) return
        }
        setHandle(null)
        hoverRangeRef.current = null
        return
      }
      const range = blockRangeAt(result.pos)
      if (!range) {
        setHandle(null)
        hoverRangeRef.current = null
        return
      }
      // 空行判定（空段落/空标题 → 显示「+」，其余显示拖拽手柄）
      const node = editor.state.doc.nodeAt(range.from)
      const empty = !!node && node.isTextblock && node.content.size === 0
      const prev = hoverRangeRef.current
      // 同一块内且空行状态未变不重算（避免高频 setState）
      if (prev && prev.from === range.from && prev.to === range.to && prev.empty === empty && handle) return
      hoverRangeRef.current = { ...range, empty }
      const rect = blockRect(range)
      if (!rect) return
      // 手柄垂直居中于块首行
      setHandle({ top: rect.firstLineCenter - 12, left: rect.left - 30, range, empty })
    }

    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, menuOpen, handle])

  // 拖拽与点击：mousedown 起始，document mousemove/mouseup 完成
  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!handle) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, range: handle.range }

    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      if (!drag.moved && Math.abs(ev.clientY - drag.startY) + Math.abs(ev.clientX - drag.startX) > 5) {
        drag.moved = true
        setDragging(true)
        setMenuOpen(false)
      }
      if (!drag.moved) return
      const result = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY })
      if (!result) {
        setIndicator(null)
        indicatorRef.current = null
        return
      }
      const target = blockRangeAt(result.pos)
      if (!target) {
        setIndicator(null)
        indicatorRef.current = null
        return
      }
      // 目标在源块自身范围内：不放
      if (target.from >= drag.range.from && target.to <= drag.range.to) {
        setIndicator(null)
        indicatorRef.current = null
        return
      }
      const rect = blockRect(target)
      if (!rect) return
      const upper = ev.clientY < rect.top + (rect.bottom - rect.top) / 2
      const insertPos = upper ? target.from : target.to
      const lineTop = upper ? rect.top : rect.bottom
      const ind = { top: lineTop, insertPos }
      indicatorRef.current = ind
      setIndicator(ind)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const drag = dragRef.current
      dragRef.current = null

      // 未拖动 = 点击：弹出/关闭操作菜单
      if (!drag || !drag.moved) {
        setDragging(false)
        setIndicator(null)
        indicatorRef.current = null
        setMenuOpen((o) => !o)
        return
      }

      setDragging(false)
      const ind = indicatorRef.current
      setIndicator(null)
      indicatorRef.current = null
      if (!ind) return

      // 执行移动：删除源块 → 在目标插入点写回（插入点按删除偏移修正）
      const { from, to } = drag.range
      const slice = editor.state.doc.slice(from, to)
      let insertPos = ind.insertPos
      if (insertPos > to) insertPos -= to - from
      const tr = editor.state.tr.delete(from, to)
      tr.replace(insertPos, insertPos, slice)
      editor.view.dispatch(tr)
      setHandle(null)
      hoverRangeRef.current = null
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 菜单打开时点击外部关闭
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-block-handle-menu]') && !target.closest('[data-block-handle-grip]')) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  if (!handle && !menuOpen) return null

  // ---------- 菜单动作 ----------
  const range = menuOpen ? (handle?.range ?? hoverRangeRef.current) : handle?.range
  if (!range) return null
  // 悬浮块为空行 → 显示「+」，否则显示拖拽手柄
  const isEmptyLine = handle?.empty ?? false
  const chain = () => editor.chain().focus()
  // 菜单操作针对该块：把光标放到块内再执行命令（PM 命令作用于当前选区）
  const withBlock = (run: () => void) => {
    editor.commands.setTextSelection({ from: range.from + 1, to: range.from + 1 })
    run()
    setMenuOpen(false)
  }

  const copyBlock = async () => {
    const text = editor.state.doc.cut(range.from, range.to).textContent
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板不可用时静默失败
    }
    setMenuOpen(false)
  }

  const cutBlock = () => {
    void copyBlock()
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
    setMenuOpen(false)
  }

  const deleteBlock = () => {
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
    setMenuOpen(false)
  }

  const insertParagraphAt = (pos: number) => {
    const tr = editor.state.tr.insert(pos, editor.state.schema.nodes.paragraph.create())
    editor.view.dispatch(tr)
    editor.commands.focus(pos + 1)
    setMenuOpen(false)
  }

  const isAlign = (v: string) => editor.isActive({ textAlign: v })

  /** 「+」按钮：光标落到当前块内并在该处打开插入菜单（与 "/" 菜单同一套） */
  const openInsertMenu = (e: React.MouseEvent) => {
    const r = range
    if (!r) return
    setMenuOpen(false)
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect()
    editor.commands.focus(r.from + 1)
    requestSlashMenu(r.from + 1, {
      left: btn.right + 8,
      top: btn.top,
      bottom: btn.bottom,
      right: btn.right,
    })
  }

  return (
    <>
      {/* 空行只显示「+」（插入），有内容的块只显示拖拽手柄，两者互斥（拖拽进行中均隐藏） */}
      {isEmptyLine ? (
        <div
          data-block-handle-plus
          style={{ top: handle?.top ?? 0, left: handle?.left ?? 0, display: dragging ? 'none' : undefined }}
          className="fixed z-[55] flex h-6 w-6 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-blue-500"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openInsertMenu}
          title="插入内容"
        >
          <Plus size={16} className="relative" />
        </div>
      ) : (
        <div
          data-block-handle-grip
          style={{ top: handle?.top ?? 0, left: handle?.left ?? 0, display: dragging ? 'none' : undefined }}
          className="fixed z-[55] flex h-6 w-6 cursor-grab items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
          onMouseDown={onHandleMouseDown}
          title="拖拽移动块，点击打开块菜单"
        >
          {/* 热区外扩：鼠标从文字移向手柄的过渡区也能命中（点击事件冒泡到手柄） */}
          <span className="absolute -inset-1.5" />
          <GripVertical size={16} className="relative" />
        </div>
      )}

      {/* 拖拽插入位置指示线 */}
      {indicator && (
        <div
          className="pointer-events-none fixed z-[56] h-0.5 rounded bg-blue-500"
          style={{ top: indicator.top, left: 16, right: 16 }}
        />
      )}

      {/* 块操作菜单 */}
      {menuOpen && (
        <div
          data-block-handle-menu
          className="fixed z-[57] w-[228px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{ top: (handle?.top ?? 0) + 26, left: Math.max(8, (handle?.left ?? 0) - 170) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 第一行：文字类型 + 列表 */}
          <div className="flex items-center gap-0.5">
            <MenuButton title="正文" active={editor.isActive('paragraph')} onClick={() => withBlock(() => chain().setParagraph().run())}>
              <Type size={14} />
            </MenuButton>
            <MenuButton title="标题1" active={editor.isActive('heading', { level: 1 })} onClick={() => withBlock(() => chain().toggleHeading({ level: 1 }).run())}>
              <Heading1 size={14} />
            </MenuButton>
            <MenuButton title="标题2" active={editor.isActive('heading', { level: 2 })} onClick={() => withBlock(() => chain().toggleHeading({ level: 2 }).run())}>
              <Heading2 size={14} />
            </MenuButton>
            <MenuButton title="标题3" active={editor.isActive('heading', { level: 3 })} onClick={() => withBlock(() => chain().toggleHeading({ level: 3 }).run())}>
              <Heading3 size={14} />
            </MenuButton>
            <MenuButton title="标题4" active={editor.isActive('heading', { level: 4 })} onClick={() => withBlock(() => chain().toggleHeading({ level: 4 }).run())}>
              <Heading4 size={14} />
            </MenuButton>
            <MenuButton title="标题5" active={editor.isActive('heading', { level: 5 })} onClick={() => withBlock(() => chain().toggleHeading({ level: 5 }).run())}>
              <Heading5 size={14} />
            </MenuButton>
            <MenuButton title="无序列表" active={editor.isActive('bulletList')} onClick={() => withBlock(() => chain().toggleBulletList().run())}>
              <List size={14} />
            </MenuButton>
            <MenuButton title="有序列表" active={editor.isActive('orderedList')} onClick={() => withBlock(() => chain().toggleOrderedList().run())}>
              <ListOrdered size={14} />
            </MenuButton>
            <MenuButton title="任务列表" active={editor.isActive('taskList')} onClick={() => withBlock(() => chain().toggleTaskList().run())}>
              <ListTodo size={14} />
            </MenuButton>
          </div>
          {/* 第二行：引用 + 对齐 */}
          <div className="mt-0.5 flex items-center gap-0.5 border-t border-slate-100 pt-1">
            <MenuButton title="引用" active={editor.isActive('blockquote')} onClick={() => withBlock(() => chain().toggleBlockquote().run())}>
              <Quote size={14} />
            </MenuButton>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <MenuButton title="左对齐" active={isAlign('left')} onClick={() => withBlock(() => chain().setTextAlign('left').run())}>
              <AlignLeft size={14} />
            </MenuButton>
            <MenuButton title="居中对齐" active={isAlign('center')} onClick={() => withBlock(() => chain().setTextAlign('center').run())}>
              <AlignCenter size={14} />
            </MenuButton>
            <MenuButton title="右对齐" active={isAlign('right')} onClick={() => withBlock(() => chain().setTextAlign('right').run())}>
              <AlignRight size={14} />
            </MenuButton>
          </div>
          {/* 第三区：复制 / 剪切 / 删除 */}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <MenuAction icon={<Copy size={14} />} label="复制内容" onClick={() => void copyBlock()} />
            <MenuAction icon={<Scissors size={14} />} label="剪切" onClick={cutBlock} />
            <MenuAction icon={<ClipboardCopy size={14} />} label="删除" danger onClick={deleteBlock} />
          </div>
          {/* 第四区：上下插入段落 */}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <MenuAction
              icon={<ArrowUpToLine size={14} />}
              label="在上方插入段落"
              onClick={() => insertParagraphAt(range.from)}
            />
            <MenuAction
              icon={<ArrowDownToLine size={14} />}
              label="在下方插入段落"
              onClick={() => insertParagraphAt(range.to)}
            />
          </div>
          <div className="flex items-center gap-1 px-2.5 pb-0.5 pt-1 text-[11px] text-slate-300">
            <Check size={10} />
            拖动手柄可移动整块
          </div>
        </div>
      )}
    </>
  )
}
