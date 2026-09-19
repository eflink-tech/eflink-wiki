/**
 * 空间统计页（路由 /app/space/:spaceId/stats）：
 * 数字卡（页面数/浏览量/版本数）+ 近 30 天浏览趋势（内联 SVG 手写折线图）+
 * 发布贡献榜（条形）+ 最近更新列表。
 */
import { Eye, FileText, GitBranch, TrendingUp } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SpaceStats } from '../../api/wiki'
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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 把后端返回的每日浏览量补齐为「截至今天的近 30 天」连续序列 */
function buildSeries(daily: { date: string; views: number }[]): { date: string; views: number }[] {
  const map = new Map(daily.map((d) => [d.date, d.views]))
  const out: { date: string; views: number }[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    out.push({ date: key, views: map.get(key) ?? 0 })
  }
  return out
}

/** 近 30 天浏览趋势：纯手写内联 SVG 折线 + 面积 + 悬浮提示 */
function TrendChart({ series }: { series: { date: string; views: number }[] }) {
  const W = 720
  const H = 210
  const PAD_L = 36
  const PAD_R = 12
  const PAD_T = 12
  const PAD_B = 24
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const max = Math.max(1, ...series.map((s) => s.views))

  const pts = series.map((s, i) => ({
    x: PAD_L + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
    y: PAD_T + innerH - (s.views / max) * innerH,
    date: s.date,
    views: s.views,
  }))
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${PAD_L},${(PAD_T + innerH).toFixed(1)} ${line} ${(W - PAD_R).toFixed(1)},${(PAD_T + innerH).toFixed(1)}`
  // y 轴网格：4 条等分线（含 0 与最大值）
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: PAD_T + innerH - r * innerH,
    label: Math.round(max * r),
  }))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近 30 天浏览趋势">
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* 网格线与刻度 */}
      {gridYs.map((g, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={g.y}
            y2={g.y}
            stroke="var(--color-line)"
            strokeWidth="1"
            strokeDasharray={i === 0 ? undefined : '4 4'}
          />
          <text x={PAD_L - 6} y={g.y + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">
            {g.label}
          </text>
        </g>
      ))}
      {/* 面积与折线 */}
      <polygon points={area} fill="url(#trend-area)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 数据点（悬浮显示数值） */}
      {pts.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="var(--color-brand)">
          <title>{`${p.date}：${p.views} 次浏览`}</title>
        </circle>
      ))}
      {/* x 轴首尾日期 */}
      <text x={PAD_L} y={H - 6} fontSize="10" fill="var(--color-ink-3)">
        {series[0]?.date.slice(5) ?? ''}
      </text>
      <text x={W - PAD_R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">
        {series[series.length - 1]?.date.slice(5) ?? ''}
      </text>
    </svg>
  )
}

/** 数字卡 */
function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
        {icon}
      </span>
      <div>
        <p className="text-meta text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink-1">{value}</p>
      </div>
    </div>
  )
}

/** 空间统计页（默认导出） */
export default function StatsPage() {
  const params = useParams()
  const spaceId = Number(params.spaceId)
  const navigate = useNavigate()

  const [stats, setStats] = useState<SpaceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    wikiApi
      .getSpaceStats(spaceId)
      .then((data) => {
        if (alive) setStats(data)
      })
      .catch(() => {
        if (alive) setStats(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [spaceId])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="flex flex-col items-center rounded-card bg-sunken py-16 text-ink-3">
          <TrendingUp size={34} />
          <p className="mt-3 text-sm">暂无统计数据</p>
        </div>
      </div>
    )
  }

  const series = buildSeries(stats.dailyViews ?? [])
  const contribMax = Math.max(1, ...(stats.contributors ?? []).map((c) => c.publishes))

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      {/* 标题 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-1">空间统计</h1>
          <p className="mt-1 text-meta text-ink-3">数据每日汇总，浏览量按页面访问次数统计</p>
        </div>
        <Link
          to={`/app/space/${spaceId}`}
          className="shrink-0 text-sm font-medium text-ink-3 transition-colors hover:text-brand"
        >
          返回空间
        </Link>
      </div>

      {/* 数字卡：页面数 / 浏览量 / 版本数 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<FileText size={20} />} label="页面数" value={stats.nodeCount} />
        <StatCard icon={<Eye size={20} />} label="浏览量" value={stats.totalViews} />
        <StatCard icon={<GitBranch size={20} />} label="版本数" value={stats.versionCount} />
      </div>

      {/* 近 30 天浏览趋势 */}
      <div className="mt-6 rounded-card border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink-1">近 30 天浏览趋势</h2>
        <div className="mt-3">
          <TrendChart series={series} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 发布贡献榜 */}
        <div className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink-1">发布贡献榜</h2>
          {(stats.contributors ?? []).length === 0 ? (
            <p className="py-10 text-center text-meta text-ink-3">暂无贡献数据</p>
          ) : (
            <div className="mt-4 space-y-3">
              {stats.contributors.map((c) => (
                <div key={c.userId}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="truncate font-medium text-ink-1">{c.displayName}</span>
                    <span className="shrink-0 tabular-nums text-meta text-ink-3">
                      {c.publishes} 篇 · {c.views} 浏览
                    </span>
                  </div>
                  {/* 条形：宽度按发布数占最大值的比例 */}
                  <div className="mt-1.5 h-2 rounded-full bg-sunken">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${Math.max(4, (c.publishes / contribMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近更新 */}
        <div className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink-1">最近更新</h2>
          {(stats.recentNodes ?? []).length === 0 ? (
            <p className="py-10 text-center text-meta text-ink-3">最近没有页面更新</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {stats.recentNodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 py-2.5 text-left"
                    onClick={() => navigate(`/app/space/${spaceId}/page/${n.id}`)}
                  >
                    <FileText size={15} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-1 transition-colors hover:text-brand">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-meta text-ink-3">{fmtTs(n.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
