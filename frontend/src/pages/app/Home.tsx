import { Clock, FileEdit, FileText, LayoutTemplate, Plus, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { RecentOpenItem, Space } from '../../api/types'
import { listRecentOpens, listSpaces } from '../../api/wiki'
import { Spinner } from '../../components/Loading'
import { emitOpenSpaceForm } from '../../lib/events'
import { cn, fmtDate } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'

/** 空间角色数值 → 文案（1 管理员 2 编辑者 3 查看者，与 MemberManageDialog 一致） */
const ROLE_TEXT: Record<Space['role'], string> = {
  1: '管理员',
  2: '编辑者',
  3: '查看者',
}

/** 主页（方案 §2.5）：问候行 + 空间卡片网格 + 右列快捷入口 */
export default function HomePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const hour = new Date().getHours()
  const greet = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'

  const [spaces, setSpaces] = useState<Space[] | null>(null)
  useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]))
  }, [])

  const [recent, setRecent] = useState<RecentOpenItem[] | null>(null)
  useEffect(() => {
    listRecentOpens()
      .then(setRecent)
      .catch(() => setRecent([]))
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      {/* 问候行 */}
      <h1 className="text-title font-semibold text-ink-1">
        {greet}，{user?.displayName ?? '朋友'}
      </h1>
      <p className="mt-1.5 text-sm text-ink-3">欢迎回来，这是团队的知识库工作台</p>

      <div className="mt-9 flex items-start gap-8">
        {/* 主列：空间卡片网格 + 最近打开 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-1">我的空间</h2>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-ctrl px-2 text-meta font-medium text-brand transition-colors hover:bg-brand-light"
              onClick={() => emitOpenSpaceForm()}
            >
              <Plus size={14} />
              新建空间
            </button>
          </div>

          {spaces === null ? (
            <div className="flex justify-center py-16">
              <Spinner size={22} />
            </div>
          ) : spaces.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-card bg-sunken px-6 py-14 text-ink-3">
              <p className="text-sm">还没有加入任何空间</p>
              <p className="text-xs">点击「新建空间」创建第一个知识空间</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {spaces.map((s) => (
                <Link
                  key={s.id}
                  to={`/app/space/${s.id}`}
                  className="group rounded-card border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-lg">
                      {s.icon ?? '📦'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-1 transition-colors group-hover:text-brand">
                        {s.name}
                      </p>
                      <p className="mt-0.5 text-meta text-ink-3">{s.memberCount} 名成员</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-1.5 py-0.5 text-xs',
                        s.role === 1 ? 'bg-brand-light text-brand' : 'bg-sunken text-ink-3',
                      )}
                    >
                      {ROLE_TEXT[s.role] ?? '成员'}
                    </span>
                  </div>
                  {s.description && (
                    <p className="mt-3 line-clamp-2 text-meta text-ink-2">{s.description}</p>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* 最近打开 */}
          <h2 className="mt-9 text-base font-semibold text-ink-1">最近打开</h2>
          {recent === null ? (
            <div className="mt-4 flex justify-center rounded-card bg-sunken py-14">
              <Spinner size={22} />
            </div>
          ) : recent.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-card bg-sunken px-6 py-14 text-ink-3">
              <Clock size={22} className="text-ink-3/60" />
              <p className="text-sm">暂无最近打开的页面</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-line rounded-card border border-line bg-surface">
              {recent.map((it) => (
                <button
                  key={it.nodeId}
                  type="button"
                  className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
                  onClick={() => navigate(`/app/space/${it.spaceId}/page/${it.nodeId}`)}
                >
                  <FileText size={15} className="shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1 transition-colors group-hover:text-brand group-hover:underline group-hover:decoration-brand/40 group-hover:underline-offset-2">
                    {it.title}
                  </span>
                  <span className="shrink-0 text-meta text-ink-3">{it.spaceName}</span>
                  <span className="w-[110px] shrink-0 text-right text-meta text-ink-3">
                    {fmtDate(it.openedAt, true)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右列：快捷入口 */}
        <aside className="hidden w-[240px] shrink-0 lg:block">
          <div className="rounded-card border border-line bg-surface p-3">
            <h2 className="px-2 pb-2 text-meta font-medium text-ink-3">快捷入口</h2>
            <Link
              to="/app/favorites"
              className="flex items-center gap-2.5 rounded-ctrl px-2 py-2 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1"
            >
              <Star size={15} className="text-warning" />
              我的收藏
            </Link>
            <Link
              to="/app/drafts"
              className="flex items-center gap-2.5 rounded-ctrl px-2 py-2 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1"
            >
              <FileEdit size={15} className="text-brand" />
              我的草稿箱
            </Link>
            <Link
              to="/app/templates"
              className="flex items-center gap-2.5 rounded-ctrl px-2 py-2 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1"
            >
              <LayoutTemplate size={15} className="text-success" />
              页面模板
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
