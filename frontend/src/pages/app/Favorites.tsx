import { Star, StarOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as wikiApi from '../../api/wiki'
import type { FavoriteItem } from '../../api/types'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import { fmtDate } from '../../lib/utils'

/** 我的收藏：列表展示 + 取消收藏 */
export default function FavoritesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<FavoriteItem[] | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await wikiApi.listFavorites())
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unfavorite = async (nodeId: number) => {
    try {
      await wikiApi.toggleFavorite(nodeId)
      toast.success('已取消收藏')
      void load()
    } catch {
      // 拦截器已提示
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-xl font-semibold text-ink-1">我的收藏</h1>
      <p className="mt-1 text-meta text-ink-3">共 {items?.length ?? 0} 个收藏页面</p>

      {!items && (
        <div className="mt-10 flex justify-center">
          <Spinner size={20} />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-card bg-sunken py-16 text-ink-3">
          <Star size={34} />
          <p className="mt-3 text-sm">还没有收藏，打开页面后点击「收藏」即可添加</p>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
          {items.map((it) => (
            <div key={it.nodeId} className="flex items-center gap-3 px-4 py-3">
              <Star size={15} className="shrink-0 fill-warning text-warning" />
              <button
                type="button"
                className="group min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => navigate(`/app/space/${it.spaceId}/page/${it.nodeId}`)}
              >
                <p className="truncate text-sm font-medium text-ink-1 transition-colors group-hover:text-brand group-hover:underline group-hover:decoration-brand/40 group-hover:underline-offset-2">
                  {it.title}
                </p>
                <p className="text-meta text-ink-3">收藏于 {fmtDate(it.createdAt, true)}</p>
              </button>
              <button
                type="button"
                title="取消收藏"
                className="shrink-0 rounded-ctrl p-1.5 text-ink-3 transition-colors hover:bg-danger-light hover:text-danger"
                onClick={() => void unfavorite(it.nodeId)}
              >
                <StarOff size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
