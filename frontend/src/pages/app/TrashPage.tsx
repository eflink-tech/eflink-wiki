/**
 * 空间回收站页（路由 /app/space/:spaceId/trash）：
 * 已删除页面表格 + 恢复 + 彻底删除（双确认）。
 */
import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TrashNode } from '../../api/wiki'
import * as wikiApi from '../../api/wiki'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/Dialog'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'

/** 时间戳 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳；空值显示 '-'） */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 空间回收站页（默认导出） */
export default function TrashPage() {
  const params = useParams()
  const spaceId = Number(params.spaceId)

  const [items, setItems] = useState<TrashNode[] | null>(null)
  /** 待彻底删除的页面（双确认第一步） */
  const [purgeTarget, setPurgeTarget] = useState<TrashNode | null>(null)
  /** 双确认第二步标记 */
  const [purgeStep2, setPurgeStep2] = useState(false)

  const load = useCallback(async () => {
    setItems(null)
    try {
      const res = await wikiApi.listTrash(spaceId)
      setItems(res.list)
    } catch {
      // 拦截器已提示
      setItems([])
    }
  }, [spaceId])

  useEffect(() => {
    void load()
  }, [load])

  /** 恢复到页面树原位置 */
  const restore = async (n: TrashNode) => {
    try {
      await wikiApi.restoreNode(n.id)
      toast.success(`「${n.title}」已恢复`)
      void load()
    } catch {
      // 拦截器已提示
    }
  }

  /** 双确认关闭时重置整个流程状态 */
  const closePurge = () => {
    setPurgeTarget(null)
    setPurgeStep2(false)
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      {/* 标题 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-1">回收站</h1>
          <p className="mt-1 text-meta text-ink-3">
            已删除的页面会保留在这里，恢复后回到页面树原位置
          </p>
        </div>
        <Link
          to={`/app/space/${spaceId}`}
          className="shrink-0 text-sm font-medium text-ink-3 transition-colors hover:text-brand"
        >
          返回空间
        </Link>
      </div>

      {/* 表格 */}
      {items === null && (
        <div className="mt-8 flex justify-center">
          <Spinner size={20} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-card bg-sunken py-16 text-ink-3">
          <Trash2 size={34} />
          <p className="mt-3 text-sm">回收站是空的</p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-6 rounded-card border border-line bg-surface p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-meta font-medium text-ink-3">
                <th className="py-2.5 pr-4">标题</th>
                <th className="py-2.5 pr-4">删除时间</th>
                <th className="py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((n) => (
                <tr key={n.id} className="hover:bg-sunken">
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2 font-medium text-ink-1">
                      <Trash2 size={14} className="shrink-0 text-ink-3" />
                      {n.title}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-ink-3">{fmtTs(n.deletedAt)}</td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button size="sm" onClick={() => void restore(n)}>
                        <RotateCcw size={13} /> 恢复
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setPurgeTarget(n)}>
                        彻底删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 彻底删除 · 第一步确认 */}
      <ConfirmDialog
        open={purgeTarget !== null && !purgeStep2}
        title="彻底删除"
        danger
        confirmText="继续"
        onClose={closePurge}
        onConfirm={async () => {
          // 第一步确认通过，进入第二步
          setPurgeStep2(true)
        }}
        content={
          purgeTarget
            ? `确定彻底删除「${purgeTarget.title}」吗？`
            : ''
        }
      />

      {/* 彻底删除 · 第二步确认（不可恢复警告） */}
      <ConfirmDialog
        open={purgeTarget !== null && purgeStep2}
        title="再次确认：永久删除"
        danger
        confirmText="永久删除"
        onClose={closePurge}
        onConfirm={async () => {
          if (!purgeTarget) return
          await wikiApi.deleteNode(purgeTarget.id, true)
          toast.success(`「${purgeTarget.title}」已彻底删除`)
          void load()
        }}
        content={
          purgeTarget ? (
            <>
              「<span className="font-medium text-ink-1">{purgeTarget.title}</span>」
              及其子页面与全部历史版本将被<b className="text-danger">永久删除</b>
              ，此操作不可恢复，确定继续吗？
            </>
          ) : (
            ''
          )
        }
      />
    </div>
  )
}
