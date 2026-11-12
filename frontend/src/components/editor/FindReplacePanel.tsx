/**
 * 编辑态查找替换面板（浮动在右上角）。
 * 快捷键：Ctrl/Cmd+F 打开并聚焦；Enter 下一个；Shift+Enter 上一个；Esc 关闭。
 */
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
  clearFind,
  getFindState,
  goToMatch,
  replaceAll,
  replaceCurrent,
  setFindQuery,
} from '../../lib/findReplace'
import { toast } from '../Toast'

interface FindReplacePanelProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
}

export default function FindReplacePanel({ editor, open, onClose }: FindReplacePanelProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  /** 本次关键词修改后是否已经跳转过（用于 Enter 首次跳到第一个命中） */
  const navigatedRef = useRef(false)

  // 订阅编辑器事务，命中数/当前项变化时刷新 UI
  useEffect(() => {
    if (!editor) return
    const refresh = () => setTick((t) => t + 1)
    editor.on('transaction', refresh)
    return () => {
      editor.off('transaction', refresh)
    }
  }, [editor])

  // 打开时若已选中文字，直接带入搜索框
  useEffect(() => {
    if (!open) return
    navigatedRef.current = false
    setReplacement('')
    if (!editor) return
    const { from, to } = editor.state.selection
    const selected = from !== to ? editor.state.doc.textBetween(from, to, ' ') : ''
    setQuery(selected)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }, [open, editor])

  // 关键词/大小写变化：实时刷新装饰
  useEffect(() => {
    if (!open || !editor) return
    setFindQuery(editor, query, caseSensitive)
    navigatedRef.current = false
  }, [open, editor, query, caseSensitive])

  // 关闭时清空高亮
  useEffect(() => {
    if (!open && editor) clearFind(editor)
  }, [open, editor])

  if (!open || !editor) return null

  const state = getFindState(editor)
  const total = state?.matches.length ?? 0
  const current = total > 0 ? state!.current + 1 : 0

  const jump = (dir: 1 | -1) => {
    if (total === 0) return
    const base = navigatedRef.current
      ? state!.current + dir
      : dir > 0
        ? 0
        : total - 1
    navigatedRef.current = true
    goToMatch(editor, base)
  }

  const doReplace = () => {
    if (total === 0) {
      toast.info('没有可替换的匹配项')
      return
    }
    navigatedRef.current = true
    replaceCurrent(editor, replacement)
  }

  const doReplaceAll = () => {
    const n = replaceAll(editor, replacement)
    toast.success(n > 0 ? `已替换 ${n} 处` : '没有可替换的匹配项')
  }

  return (
    <div
      className="no-print fixed right-4 top-16 z-[70] w-[min(420px,calc(100vw-2rem))] rounded-pop border border-line bg-surface p-3 shadow-3"
      role="dialog"
      aria-label="查找替换"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          placeholder="查找内容"
          className="h-8 min-w-0 flex-1 rounded-ctrl border border-line bg-surface px-2.5 text-sm text-ink-1 outline-none focus:border-brand"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              jump(e.shiftKey ? -1 : 1)
            }
          }}
        />
        <span className="min-w-[52px] shrink-0 text-center text-xs tabular-nums text-ink-3">
          {total > 0 ? `${current}/${total}` : '无结果'}
        </span>
        <button
          type="button"
          title="上一个（Shift+Enter）"
          className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-sunken disabled:opacity-40"
          disabled={total === 0}
          onClick={() => jump(-1)}
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          title="下一个（Enter）"
          className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-sunken disabled:opacity-40"
          disabled={total === 0}
          onClick={() => jump(1)}
        >
          <ChevronDown size={15} />
        </button>
        <button
          type="button"
          title={caseSensitive ? '区分大小写：开' : '区分大小写：关'}
          className={`flex h-7 items-center rounded px-1.5 text-xs ${
            caseSensitive ? 'bg-brand-light text-brand' : 'text-ink-2 hover:bg-sunken'
          }`}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          type="button"
          title="关闭（Esc）"
          className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-sunken"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={replacement}
          placeholder="替换为"
          className="h-8 min-w-0 flex-1 rounded-ctrl border border-line bg-surface px-2.5 text-sm text-ink-1 outline-none focus:border-brand"
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              doReplace()
            }
          }}
        />
        <button
          type="button"
          className="h-8 shrink-0 rounded-ctrl border border-line px-2.5 text-xs text-ink-2 hover:bg-sunken disabled:opacity-40"
          disabled={total === 0}
          onClick={doReplace}
        >
          替换
        </button>
        <button
          type="button"
          className="h-8 shrink-0 rounded-ctrl border border-line px-2.5 text-xs text-ink-2 hover:bg-sunken disabled:opacity-40"
          disabled={total === 0}
          onClick={doReplaceAll}
        >
          全部替换
        </button>
      </div>
    </div>
  )
}
