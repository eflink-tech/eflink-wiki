/**
 * 管理后台 · 操作审计页（路由 /admin/operations）：
 * 审计日志表格（时间/操作人/动作/目标/详情/IP）+ 动作类型过滤 + 分页。
 * 页面样式与用户管理页保持一致（独立顶栏，仅管理员可访问，路由层做守卫）。
 */
import { ArrowLeft, ListFilter, ScrollText, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PageResult } from '../../api/types'
import type { OperationLog } from '../../api/admin'
import * as adminApi from '../../api/admin'
import { Button } from '../../components/Button'
import { Dropdown, DropdownItem } from '../../components/Dropdown'
import { Spinner } from '../../components/Loading'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 15

/** 时间戳 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳） */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 动作类型过滤项（value 为空表示全部） */
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部动作' },
  { value: 'user.login', label: '登录（user.login）' },
  { value: 'node.publish', label: '发布页面（node.publish）' },
  { value: 'node.delete', label: '删除页面（node.delete）' },
  { value: 'node.restore', label: '恢复页面（node.restore）' },
  { value: 'node.purge', label: '彻底删除（node.purge）' },
  { value: 'user.create', label: '创建用户（user.create）' },
  { value: 'user.update', label: '更新用户（user.update）' },
  { value: 'member.add', label: '添加成员（member.add）' },
  { value: 'member.remove', label: '移除成员（member.remove）' },
]

/** 动作徽标配色（按动作关键约定色：删除红 / 恢复琥珀 / 发布绿 / 登录蓝 / 成员靛） */
function actionBadgeCls(action: string): string {
  if (action.includes('purge') || action.includes('delete')) return 'bg-danger-light text-danger'
  if (action.includes('restore')) return 'bg-warning-light text-warning-ink'
  if (action.includes('publish')) return 'bg-success-light text-success'
  if (action.includes('login')) return 'bg-brand-light text-brand'
  if (action.includes('create')) return 'bg-success-light text-success'
  if (action.includes('update')) return 'bg-sunken text-ink-3'
  if (action.includes('member')) return 'bg-brand-light text-brand'
  return 'bg-sunken text-ink-3'
}

/** 动作中文名（未知动作原样显示） */
function actionLabel(action: string): string {
  const hit = ACTION_OPTIONS.find((o) => o.value === action)
  return hit ? hit.label.replace(/（.*）/, '') : action
}

/** 操作审计页（默认导出） */
export default function OperationsPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<OperationLog> | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await adminApi.listOperations({
          action: action || undefined,
          page,
          size: PAGE_SIZE,
        }),
      )
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }, [action, page])

  useEffect(() => {
    void load()
  }, [load])

  const currentOption = ACTION_OPTIONS.find((o) => o.value === action) ?? ACTION_OPTIONS[0]
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6">
        <ScrollText size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · 操作审计</h1>
        <Link
          to="/admin/users"
          className="ml-auto flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <Users size={14} /> 用户管理
        </Link>
        <Link
          to="/app"
          className="flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <ArrowLeft size={14} />
          返回知识库
        </Link>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {/* 工具条：动作类型过滤 */}
        <div className="flex items-center gap-3">
          <Dropdown
            align="left"
            trigger={
              <Button>
                <ListFilter size={14} /> {currentOption.label}
              </Button>
            }
          >
            {ACTION_OPTIONS.map((o) => (
              <DropdownItem
                key={o.value}
                active={o.value === action}
                onClick={() => {
                  setPage(1)
                  setAction(o.value)
                }}
              >
                {o.label}
              </DropdownItem>
            ))}
          </Dropdown>
          <span className="text-meta text-ink-3">按动作关键字过滤审计日志</span>
        </div>

        {/* 日志表格 */}
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          {loading && (
            <div className="flex justify-center pb-3">
              <Spinner size={18} />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-meta font-medium text-ink-3">
                <th className="py-2.5 pr-4">时间</th>
                <th className="py-2.5 pr-4">操作人</th>
                <th className="py-2.5 pr-4">动作</th>
                <th className="py-2.5 pr-4">目标</th>
                <th className="py-2.5 pr-4">详情</th>
                <th className="py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.list.map((log) => (
                <tr key={log.id} className="hover:bg-sunken">
                  <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">
                    {fmtTs(log.createdAt)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-ink-1">
                    {log.username || `#${log.userId}`}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      title={log.action}
                      className={cn(
                        'inline-block whitespace-nowrap rounded-ctrl px-1.5 py-0.5 text-meta',
                        actionBadgeCls(log.action),
                      )}
                    >
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">
                    {log.targetType ? `${log.targetType}#${log.targetId ?? '-'}` : '-'}
                  </td>
                  <td
                    className="max-w-[280px] truncate py-2.5 pr-4 text-ink-3"
                    title={log.detail ?? undefined}
                  >
                    {log.detail || '-'}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-ink-3">{log.ip || '-'}</td>
                </tr>
              ))}
              {data && data.list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <ScrollText size={28} className="mx-auto mb-2 text-ink-3" />
                    没有匹配的操作记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-meta text-ink-3">
            <span>共 {total} 条记录</span>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <Button
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
