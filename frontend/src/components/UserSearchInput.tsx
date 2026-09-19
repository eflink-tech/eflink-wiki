/**
 * 用户即搜即选输入框：输入即搜（300ms 防抖），下拉展示结果，
 * 点击或回车直接选中并回调 onPick（父组件负责调用加入接口与提示），
 * 免去「点搜索 → 挑人 → 再点添加」的多步操作。
 * 已在列表中的用户以禁用态展示并带标签，避免重复添加。
 */
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as wikiApi from '../api/wiki'
import type { UserBrief } from '../api/wiki'
import { Spinner } from './Loading'
import { cn } from '../lib/utils'

interface UserSearchInputProps {
  /** 选中用户时触发（已await安全）；父组件负责加入接口、toast 与列表刷新 */
  onPick: (user: UserBrief) => Promise<void> | void
  /** 已在列表中的用户 ID，结果中显示为不可选 */
  excludeUserIds?: number[]
  /** 已在列表用户的标签文案 */
  excludeLabel?: string
  placeholder?: string
  autoFocus?: boolean
}

/** 头像（有图用图，无图用姓名首字） */
function Avatar({ user, size = 28 }: { user: UserBrief; size?: number }) {
  return user.avatar ? (
    <img
      src={user.avatar}
      alt={user.displayName}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.43 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-blue-600 font-medium text-white"
    >
      {(user.displayName || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function UserSearchInput({
  onPick,
  excludeUserIds = [],
  excludeLabel = '已加入',
  placeholder = '搜索用户名或姓名，点击直接添加',
  autoFocus,
}: UserSearchInputProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<UserBrief[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reqRef = useRef(0)

  const joined = (u: UserBrief) => excludeUserIds.includes(u.id)
  const pickable = results.filter((u) => !joined(u))

  /* 输入防抖搜索 */
  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      const req = ++reqRef.current
      try {
        const res = await wikiApi.searchUsers(kw)
        if (reqRef.current === req) setResults(res.list)
      } catch {
        if (reqRef.current === req) setResults([])
      } finally {
        if (reqRef.current === req) setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  /* 打开时监听点击外部 / Esc 关闭（同 Dropdown 模式） */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => setActive(0), [results])

  const pick = async (u: UserBrief) => {
    if (joined(u)) return
    setKeyword('')
    setResults([])
    setOpen(false)
    await onPick(u)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (pickable.length === 0) return
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : pickable.length - 1)) % pickable.length)
    } else if (e.key === 'Enter') {
      const target = pickable[active] ?? pickable[0]
      if (target) void pick(target)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
        placeholder={placeholder}
        value={keyword}
        autoFocus={autoFocus}
        onChange={(e) => {
          setKeyword(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && keyword.trim() !== '' && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {loading && (
            <div className="flex justify-center py-4">
              <Spinner size={18} />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-4 text-center text-[13px] text-slate-400">没有匹配的用户</p>
          )}
          {!loading &&
            results.map((u) => {
              const isJoined = joined(u)
              const activeIdx = pickable.indexOf(u)
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={isJoined}
                  onClick={() => void pick(u)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                    isJoined
                      ? 'cursor-not-allowed opacity-55'
                      : activeIdx === active
                        ? 'bg-blue-50'
                        : 'hover:bg-slate-50',
                  )}
                >
                  <Avatar user={u} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {u.displayName}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">@{u.username}</span>
                  {isJoined && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      {excludeLabel}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
