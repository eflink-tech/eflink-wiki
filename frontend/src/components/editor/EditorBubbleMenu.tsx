/**
 * 编辑态气泡工具栏：选中文字后浮动显示于选区上方（不再使用常驻顶栏）。
 * 自实现定位：监听编辑器 selectionUpdate / document selectionchange，
 * 选区为「文字选区」（TextSelection/AllSelection）时按 PM 选区坐标把工具栏 portal 到 body，
 * 滚动时先隐藏（重新选择再现）。
 * 内容：文字类型（正文/H1~H5）、文字大小、加粗/斜体/下划线/删除线、高亮、文字颜色、行内代码、链接、三种列表、引用。
 * 不显示的场景：代码块内（其语言/格式化在代码块自带工具条）；
 * 选中组件本身（嵌入卡片等 NodeSelection）、表格单元格框选（CellSelection）等非文字选区。
 */
import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AllSelection, TextSelection } from '@tiptap/pm/state'
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Palette,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { FONT_SIZE_OPTIONS } from './fontSize'

/** 文字颜色色板（首项 null = 恢复默认） */
const TEXT_COLORS: (string | null)[] = [
  null,
  '#0f172a',
  '#64748b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

/** 气泡按钮 */
function BubbleButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      // 阻止编辑器因点击工具栏而失焦丢失选区
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

function BubbleDivider() {
  return <span className="mx-0.5 h-4 w-px bg-slate-200" />
}

/** 文字颜色选择（下拉色板） */
function TextColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const current = (editor.getAttributes('textStyle').color as string | undefined) ?? null

  return (
    <div className="relative">
      <button
        type="button"
        title="文字颜色"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-7 w-7 flex-col items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100',
          current && 'bg-blue-50 text-blue-600 hover:bg-blue-50',
        )}
      >
        <Palette size={14} />
        <span
          className="mt-0.5 h-0.5 w-3.5 rounded-full"
          style={{ backgroundColor: current ?? '#0f172a' }}
        />
      </button>
      {open && (
        <div
          className="absolute left-1/2 top-full z-10 mt-1 w-[152px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="grid grid-cols-6 gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c ?? 'default'}
                type="button"
                title={c ?? '默认颜色'}
                onClick={() => {
                  if (c) editor.chain().focus().setColor(c).run()
                  else editor.chain().focus().unsetColor().run()
                  setOpen(false)
                }}
                className={cn(
                  'h-5 w-5 rounded border border-slate-200 transition-transform hover:scale-110',
                  !c &&
                    'bg-[linear-gradient(135deg,transparent_45%,#94a3b8_45%,#94a3b8_55%,transparent_55%)]',
                  current === c && 'ring-2 ring-blue-400 ring-offset-1',
                )}
                style={c ? { backgroundColor: c } : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** 设置文字类型（正文/标题），保留选区 */
function TextTypeSelect({ editor }: { editor: Editor }) {
  const isHeading = (level: 1 | 2 | 3 | 4 | 5) => editor.isActive('heading', { level })
  const value = isHeading(1)
    ? 'h1'
    : isHeading(2)
      ? 'h2'
      : isHeading(3)
        ? 'h3'
        : isHeading(4)
          ? 'h4'
          : isHeading(5)
            ? 'h5'
            : 'p'
  return (
    <select
      title="文字类型"
      value={value}
      onChange={(e) => {
        const v = e.target.value
        const chain = editor.chain().focus()
        if (v === 'p') chain.setParagraph().run()
        else chain.toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 | 5 }).run()
      }}
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
  )
}

/** 设置选区文字大小；空值 = 恢复正文默认字号 */
function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? ''
  const known = FONT_SIZE_OPTIONS.some((o) => o.value === current)
  return (
    <select
      title="文字大小"
      value={current}
      onChange={(e) => {
        const v = e.target.value
        const chain = editor.chain().focus()
        if (v) chain.setFontSize(v).run()
        else chain.unsetFontSize().run()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="h-7 min-w-[3.75rem] cursor-pointer rounded border-0 bg-transparent pl-1 pr-0 text-xs text-slate-600 outline-none hover:bg-slate-100"
    >
      {current && !known && <option value={current}>{current.replace(/px$/i, '')}</option>}
      {FONT_SIZE_OPTIONS.map((o) => (
        <option key={o.value || 'default'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function EditorBubbleMenu({ editor }: { editor: Editor }) {
  // 选区矩形（视口坐标）；null = 隐藏工具栏
  const [rect, setRect] = useState<DOMRect | null>(null)
  // 激活态随编辑事务刷新
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      setTick((t) => t + 1)
      if (!editor.isEditable || editor.isDestroyed) {
        setRect(null)
        return
      }
      const selection = editor.state.selection
      // 仅文字选区（含 Ctrl+A 全选）显示；组件 NodeSelection / 表格 CellSelection
      // 的 from !== to 但并非选中文字，不得弹出文字格式工具栏
      const isTextSelection = selection instanceof TextSelection || selection instanceof AllSelection
      if (selection.empty || !isTextSelection || editor.isActive('codeBlock')) {
        setRect(null)
        return
      }
      try {
        // 用 PM 视口坐标同步计算选区包围盒（不依赖 DOM selection / 焦点 / rAF）
        const start = editor.view.coordsAtPos(selection.from)
        const end = editor.view.coordsAtPos(selection.to)
        const top = Math.min(start.top, end.top)
        const bottom = Math.max(start.bottom, end.bottom)
        const left = Math.min(start.left, end.left)
        const right = Math.max(start.right, end.right)
        const width = right - left
        const height = bottom - top
        setRect(width > 0 || height > 0 ? ({ left, right, top, bottom, width, height } as DOMRect) : null)
      } catch {
        setRect(null)
      }
    }

    const hide = () => setRect(null)

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    document.addEventListener('selectionchange', update)
    // 任何滚动先隐藏，避免工具栏飘在错误位置（重新选择即再现）
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)

    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [editor])

  if (!rect) return null

  const link = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('输入链接地址（留空取消）')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return createPortal(
    <div
      className="z-[60] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: Math.max(8, rect.top - 42),
        transform: 'translateX(-50%)',
      }}
      // 阻止面板内 mousedown 冒泡导致选区丢失
      onMouseDown={(e) => e.preventDefault()}
    >
      <TextTypeSelect editor={editor} />
      <FontSizeSelect editor={editor} />
      <BubbleDivider />
      <BubbleButton title="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </BubbleButton>
      <BubbleButton title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </BubbleButton>
      <BubbleButton
        title="下划线"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={14} />
      </BubbleButton>
      <BubbleButton
        title="删除线"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={14} />
      </BubbleButton>
      <BubbleButton
        title="高亮"
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter size={14} />
      </BubbleButton>
      <TextColorPicker editor={editor} />
      <BubbleButton
        title="行内代码"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} />
      </BubbleButton>
      <BubbleButton title={editor.isActive('link') ? '取消链接' : '添加链接'} active={editor.isActive('link')} onClick={link}>
        <Link2 size={14} />
      </BubbleButton>
      <BubbleDivider />
      <BubbleButton
        title="无序列表"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </BubbleButton>
      <BubbleButton
        title="有序列表"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </BubbleButton>
      <BubbleButton
        title="任务列表"
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListTodo size={14} />
      </BubbleButton>
      <BubbleButton
        title="引用"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={14} />
      </BubbleButton>
    </div>,
    document.body,
  )
}
