/**
 * 我的草稿箱页（路由 /app/drafts）：
 * 我有未发布草稿的页面列表（所属空间/标题/更新时间），点击跳转对应页面继续编辑。
 */
import { FilePen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DraftListItem } from '../../api/wiki'
import * as wikiApi from '../../api/wiki'
import { Spinner } from '../../components/Loading'

/** 时间戳 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳；空值显示 '-'） */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 我的草稿箱页（默认导出） */
export default function DraftsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<DraftListItem[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await wikiApi.listMyDrafts()
      setItems(res.list)
    } catch {
      // 拦截器已提示
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-xl font-semibold text-ink-1">我的草稿箱</h1>
      <p className="mt-1 text-meta text-ink-3">
        以下页面存在你未发布的草稿，点击进入继续编辑并发布
      </p>

      {items === null && (
        <div className="mt-8 flex justify-center">
          <Spinner size={20} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-card bg-sunken py-16 text-ink-3">
          <FilePen size={34} />
          <p className="mt-3 text-sm">没有未发布的草稿</p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {items.map((d) => (
            <button
              key={d.nodeId}
              type="button"
              className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
              onClick={() => navigate(`/app/space/${d.spaceId}/page/${d.nodeId}`)}
            >
              <FilePen size={15} className="shrink-0 text-ink-3" />
              <span className="shrink-0 rounded-ctrl bg-brand-light px-1.5 py-0.5 text-meta text-brand">
                {d.spaceName}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1 transition-colors group-hover:text-brand group-hover:underline group-hover:decoration-brand/40 group-hover:underline-offset-2">
                {d.title}
              </span>
              <span className="shrink-0 text-meta text-ink-3">
                更新于 {fmtTs(d.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
