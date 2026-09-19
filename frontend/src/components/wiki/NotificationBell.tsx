/**
 * 顶栏通知铃铛：未读红点（30s 轮询）+ 下拉通知列表。
 * 点击通知项：标记已读并按 payload 跳转（页面 + 评论锚点 comment-{id}）。
 * 支持全部已读；加载更多走分页。
 */
import { Bell } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNotifications, markNotificationsRead } from '../../api/wiki'
import type { NotificationItem } from '../../api/wiki'
import { Dropdown } from '../Dropdown'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20
/** 未读数轮询间隔 */
const POLL_MS = 30_000

function fmtTs(ts: number | null): string {
  if (!ts) return ''
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const TYPE_TEXT: Record<number, string> = {
  1: '评论',
  2: '回复',
  3: '提及',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const refreshUnread = useCallback(async () => {
    try {
      const res = await listNotifications(1, 1)
      setUnread(res.unread)
    } catch {
      // 静默：轮询失败不打扰用户
    }
  }, [])

  const loadPage = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await listNotifications(p, PAGE_SIZE)
      setItems((prev) => (p === 1 ? res.list : [...prev, ...res.list]))
      setHasMore(res.hasMore)
      setUnread(res.unread)
      setPage(p)
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }, [])

  // 未读数轮询
  useEffect(() => {
    void refreshUnread()
    const timer = window.setInterval(() => void refreshUnread(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshUnread])

  // 打开面板时拉第一页
  useEffect(() => {
    if (open) void loadPage(1)
  }, [open, loadPage])

  const onItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, isRead: true } : it)))
      setUnread((u) => Math.max(0, u - 1))
      void markNotificationsRead({ ids: [item.id] }).catch(() => {})
    }
    setOpen(false)
    if (item.nodeId > 0) {
      const hash = item.commentId > 0 ? `#comment-${item.commentId}` : ''
      navigate(`/app/space/${item.spaceId}/page/${item.nodeId}${hash}`)
    }
  }

  const markAll = async () => {
    setItems((prev) => prev.map((it) => ({ ...it, isRead: true })))
    setUnread(0)
    await markNotificationsRead({ all: true }).catch(() => {})
  }

  return (
    <Dropdown
      align="right"
      menuClassName="w-80"
      open={open}
      onOpenChange={setOpen}
      closeOnItemClick={false}
      trigger={
        <button
          type="button"
          title="通知"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-ctrl text-ink-2 transition-colors hover:bg-sunken"
        >
          <Bell size={17} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-medium text-ink-1">通知</span>
        {unread > 0 && (
          <button
            type="button"
            className="text-meta text-brand transition-colors hover:opacity-80"
            onClick={() => void markAll()}
          >
            全部已读
          </button>
        )}
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto">
        {items.length === 0 && !loading && (
          <p className="px-3 py-8 text-center text-sm text-ink-3">暂无通知</p>
        )}
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={cn(
              'flex w-full flex-col items-start gap-0.5 border-b border-line/60 px-3 py-2.5 text-left transition-colors hover:bg-sunken',
              !it.isRead && 'bg-brand-light/40',
            )}
            onClick={() => void onItemClick(it)}
          >
            <span className="flex w-full items-center gap-2">
              <span
                className={cn(
                  'shrink-0 rounded px-1 py-0.5 text-[10px] leading-none',
                  it.type === 3
                    ? 'bg-violet-50 text-violet-600'
                    : it.type === 2
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-blue-50 text-blue-600',
                )}
              >
                {TYPE_TEXT[it.type] ?? '通知'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{it.title}</span>
              {!it.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
            </span>
            <span className="pl-0.5 text-[11px] text-ink-3">{fmtTs(it.createdAt)}</span>
          </button>
        ))}
        {loading && <p className="px-3 py-4 text-center text-meta text-ink-3">加载中…</p>}
        {hasMore && !loading && (
          <button
            type="button"
            className="w-full py-2 text-center text-meta text-brand transition-colors hover:opacity-80"
            onClick={() => void loadPage(page + 1)}
          >
            加载更多
          </button>
        )}
      </div>
    </Dropdown>
  )
}
