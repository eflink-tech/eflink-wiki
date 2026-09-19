/**
 * Slash 菜单的内联插入弹层集合：
 * - LinkDialog：链接（URL + 显示文字，确认后光标处插入内联链接）
 * - DateDialog：日期（原生日期选择，插入 YYYY-MM-DD 文本）
 * - MediaUrlDialog：视频 / 音频（外链地址或本地上传）、网页（仅外链）
 * - EmojiPicker：表情面板（分类页签 + 网格点选，插入 unicode 文本）
 */
import { Check, Loader2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { Dialog } from '../Dialog'
import { Input } from '../Input'
import { uploadFile } from './upload'
import { EMOJI_PANEL_H, EMOJI_PANEL_W, placeSlashMenu } from './slashMenuLayout'

/** 地址补全：无协议前缀时默认按 https 处理；返回空串表示无效 */
function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (/^(https?:\/\/|\/)/i.test(v)) return v
  return `https://${v}`
}

/* ==================== 链接 ==================== */

export function LinkDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (href: string, text: string) => void
}) {
  const [href, setHref] = useState('')
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) {
      setHref('')
      setText('')
    }
  }, [open])
  const submit = () => {
    const url = normalizeUrl(href)
    if (!url) return
    onConfirm(url, text.trim())
  }
  return (
    <Dialog
      open={open}
      title="插入链接"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            取消
          </button>
          <button type="button" className="h-9 rounded-md border border-blue-600 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700" onClick={submit}>
            插入
          </button>
        </>
      }
    >
      <Input autoFocus label="地址" placeholder="https://example.com" value={href} onChange={(e) => setHref(e.target.value)} />
      <Input label="显示文字（留空使用地址）" placeholder="链接文字" value={text} onChange={(e) => setText(e.target.value)} />
    </Dialog>
  )
}

/* ==================== 日期 ==================== */

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function DateDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (dateStr: string) => void
}) {
  const [value, setValue] = useState(todayStr)
  useEffect(() => {
    if (open) setValue(todayStr())
  }, [open])
  return (
    <Dialog
      open={open}
      title="插入日期"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            取消
          </button>
          <button type="button" className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setValue(todayStr())}>
            今天
          </button>
          <button type="button" className="h-9 rounded-md border border-blue-600 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700" onClick={() => value && onConfirm(value)}>
            插入
          </button>
        </>
      }
    >
      <Input autoFocus type="date" label="选择日期" value={value} onChange={(e) => setValue(e.target.value)} />
    </Dialog>
  )
}

/* ==================== 视频 / 音频 / 网页 ==================== */

export type MediaKind = 'video' | 'audio' | 'webpage'

const MEDIA_META: Record<MediaKind, { title: string; placeholder: string; accept?: string }> = {
  video: { title: '插入视频', placeholder: '视频地址（mp4 / webm…）', accept: 'video/*' },
  audio: { title: '插入音频', placeholder: '音频地址（mp3 / wav…）', accept: 'audio/*' },
  webpage: { title: '插入网页', placeholder: 'https://example.com' },
}

export function MediaUrlDialog({
  open,
  kind,
  onClose,
  onConfirm,
}: {
  open: boolean
  kind: MediaKind
  onClose: () => void
  /** 确认外链，或本地文件上传完成后回调 */
  onConfirm: (src: string) => void
}) {
  const meta = MEDIA_META[kind]
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      setUrl('')
      setUploading(false)
    }
  }, [open, kind])

  const isWebpage = kind === 'webpage'
  const submit = () => {
    const src = normalizeUrl(url)
    // 网页必须是完整 http(s) 地址；媒体允许站内 /uploads 相对路径
    if (!src || (isWebpage && !/^https?:\/\//i.test(src))) return
    onConfirm(src)
  }

  return (
    <Dialog
      open={open}
      title={meta.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            取消
          </button>
          <button type="button" className="h-9 rounded-md border border-blue-600 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-50" disabled={uploading} onClick={submit}>
            插入
          </button>
        </>
      }
    >
      <Input
        autoFocus
        label="地址"
        placeholder={meta.placeholder}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {!isWebpage && (
        <>
          <p className="mb-2 mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-100" />
            或上传本地文件
            <span className="h-px flex-1 bg-slate-100" />
          </p>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? '上传中…' : '选择文件上传'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={meta.accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setUploading(true)
              uploadFile(file)
                .then((src) => {
                  onConfirm(src)
                })
                .catch(() => {
                  // 上传失败已由拦截器提示
                })
                .finally(() => setUploading(false))
            }}
          />
        </>
      )}
    </Dialog>
  )
}

/* ==================== 表情面板 ==================== */

/** 分类表情（curated，覆盖常用场景） */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: '常用',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😭', '😤', '🥳', '😴', '🙃', '😇', '🤗', '🤩', '😜', '😳', '🥺', '😡', '😱', '🤯', '🥶', '😷'],
  },
  {
    label: '手势',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '🙏', '💪', '👋', '🤙', '👊', '✊', '🫡', '🖖', '☝️', '👆', '👇', '👉', '👈', '🫶', '🤟', '🤘', '👐'],
  },
  {
    label: '状态',
    emojis: ['✅', '❌', '⚠️', '❗', '❓', '💯', '🔥', '⭐', '🎉', '🎊', '✨', '💡', '📌', '🚀', '⏰', '🕐', '📅', '📊', '📈', '📉', '🔄', '🆗', '🚫', '⛔', '🟢'],
  },
  {
    label: '对象',
    emojis: ['📁', '📂', '📄', '📃', '📝', '✏️', '📎', '🔗', '🔒', '🔑', '🗂️', '📦', '📫', '🖥️', '💻', '📱', '⚙️', '🔧', '🛠️', '🧰', '🧪', '🔬', '🔍', '💾', '🖥️'],
  },
  {
    label: '自然',
    emojis: ['🐱', '🐶', '🐭', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦄', '🐝', '🦋', '🐢', '🐙', '🌵', '🌲', '🍀', '🌸', '🌞'],
  },
  {
    label: '食物',
    emojis: ['🍎', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥝', '🍅', '🥑', '🌮', '🍕', '🍔', '🍟', '🍿', '🍩', '🍪', '🎂', '🍺', '☕', '🍵', '🧋', '🥤', '🍜', '🍱'],
  },
]

export function EmojiPicker({
  open,
  left,
  cursorTop,
  cursorBottom,
  onClose,
  onPick,
}: {
  open: boolean
  left: number
  cursorTop: number
  cursorBottom: number
  onClose: () => void
  onPick: (emoji: string) => void
}) {
  const [group, setGroup] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 延迟监听外部点击：避免「表情」菜单项那一次 mousedown 冒泡到 document 后立刻关掉面板
  useEffect(() => {
    if (!open) return
    let onDown: ((e: MouseEvent) => void) | undefined
    const timer = window.setTimeout(() => {
      onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
      }
      document.addEventListener('mousedown', onDown)
    }, 250)
    return () => {
      window.clearTimeout(timer)
      if (onDown) document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open || typeof document === 'undefined') return null
  const emojis = EMOJI_GROUPS[group].emojis
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const placed = placeSlashMenu(
    { left, top: cursorTop, bottom: cursorBottom || cursorTop + 24 },
    { width: vw, height: vh },
    EMOJI_PANEL_H,
    EMOJI_PANEL_W,
  )
  return createPortal(
    <div
      ref={ref}
      data-emoji-picker
      className="fixed z-[200] w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
      style={{ top: placed.top, left: placed.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex gap-0.5 overflow-x-auto">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            className={cn(
              'shrink-0 rounded-md px-2 py-1 text-xs transition-colors',
              i === group ? 'bg-blue-50 font-medium text-blue-600' : 'text-slate-500 hover:bg-slate-100',
            )}
            onClick={() => setGroup(i)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
        {emojis.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-slate-100"
            onPointerDown={(ev) => {
              ev.preventDefault()
              ev.stopPropagation()
              onPick(e)
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-300">
        <Check size={10} />
        点击表情插入到光标处（Esc 关闭）
      </p>
    </div>,
    document.body,
  )
}
