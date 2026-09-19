/**
 * 管理后台 · Webhook 订阅页（路由 /admin/webhooks）：
 * 订阅表格（名称/URL/事件/状态开关/删除确认）+ 新建订阅弹窗（密钥留空自动生成）+
 * 投递记录抽屉（按订阅过滤，展示时间/事件/响应码/成功失败/错误信息，payload 可展开全文）。
 * 页面样式与操作审计页保持一致（独立顶栏，仅系统管理员可访问，路由层做守卫）。
 */
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Inbox,
  Plus,
  RefreshCw,
  Trash2,
  FileKey,
  Webhook,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../../api/client'
import { Button } from '../../components/Button'
import { ConfirmDialog, Dialog, DialogError } from '../../components/Dialog'
import { Input } from '../../components/Input'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import { cn } from '../../lib/utils'

/** Webhook 订阅条目（status: 1=启用 2=停用） */
interface WebhookItem {
  id: number
  name: string
  url: string
  /** 订阅的事件（'*' 表示全部） */
  events: string
  status: 1 | 2
  createdAt: number | string | null
}

/** Webhook 投递记录 */
interface WebhookDelivery {
  id: number
  webhookId: number
  event: string
  payload: string | null
  respCode: number | null
  success: boolean
  error: string | null
  createdAt: number | string | null
}

/* ---------------- API ---------------- */

/** 订阅列表（兼容数组或 { list } 两种返回形态） */
async function listWebhooks(): Promise<WebhookItem[]> {
  const res = await request<WebhookItem[] | { list?: WebhookItem[] }>({
    url: '/admin/webhooks',
    method: 'GET',
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/** 新建订阅（secret 留空由后端自动生成） */
const createWebhook = (data: { name: string; url: string; secret?: string; events?: string }) =>
  request<WebhookItem>({ url: '/admin/webhooks', method: 'POST', data })

/** 更新订阅（启用/停用走 status 1|2） */
const updateWebhook = (
  id: number,
  data: { name?: string; url?: string; events?: string; status?: 1 | 2 },
) => request<WebhookItem>({ url: `/admin/webhooks/${id}`, method: 'PUT', data })

/** 删除订阅 */
const deleteWebhook = (id: number) =>
  request<null>({ url: `/admin/webhooks/${id}`, method: 'DELETE' })

/** 投递记录（webhookId 缺省查全部，最多最近 100 条） */
async function listDeliveries(webhookId?: number): Promise<WebhookDelivery[]> {
  const res = await request<WebhookDelivery[] | { list?: WebhookDelivery[] }>({
    url: '/admin/webhooks/deliveries',
    method: 'GET',
    params: webhookId != null ? { webhookId } : undefined,
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/* ---------------- 工具 ---------------- */

/** 时间戳/ISO 字符串 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳） */
function fmtTs(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  const raw = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  const ms = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(raw))
  if (Number.isNaN(ms)) return String(value)
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 事件字段展示（防御性兼容数组形态），空值显示 '*' */
function eventsText(events: unknown): string {
  if (Array.isArray(events)) return events.map(String).join(', ') || '*'
  const s = String(events ?? '').trim()
  return s || '*'
}

/** payload 美化输出：合法 JSON 格式化缩进，否则原样展示 */
function prettyJson(payload: string | null): string {
  if (!payload) return '（空）'
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

/** 启停开关（1 启用 / 2 停用） */
function StatusSwitch({
  value,
  disabled,
  onChange,
}: {
  value: 1 | 2
  disabled?: boolean
  onChange: (next: 1 | 2) => void
}) {
  const on = value === 1
  return (
    <button
      type="button"
      disabled={disabled}
      title={on ? '点击停用' : '点击启用'}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'bg-success' : 'bg-ink-3',
      )}
      onClick={() => onChange(on ? 2 : 1)}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/* ==================== 投递记录抽屉 ==================== */

function DeliveryDrawer({
  open,
  onClose,
  webhooks,
  initialFilter,
}: {
  open: boolean
  onClose: () => void
  webhooks: WebhookItem[]
  initialFilter: number | 'all'
}) {
  const [filter, setFilter] = useState<number | 'all'>(initialFilter)
  const [list, setList] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setList(await listDeliveries(filter === 'all' ? undefined : filter))
    } catch (err) {
      setError(err instanceof Error ? err.message : '投递记录加载失败')
    } finally {
      setLoading(false)
    }
  }, [filter])

  // 打开时同步过滤条件；过滤条件变化时重新加载
  useEffect(() => {
    if (open) setFilter(initialFilter)
  }, [open, initialFilter])
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!open) return null

  const nameOf = (webhookId: number) => webhooks.find((w) => w.id === webhookId)?.name ?? `#${webhookId}`

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-end bg-ink-1/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-line bg-surface shadow-3">
        {/* 抽屉头 */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
            <Inbox size={16} className="text-ink-3" />
            投递记录
          </h3>
          <button type="button" className="text-ink-3 hover:text-ink-1" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* 过滤条：按订阅筛选 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3">
          <select
            className="h-8 min-w-0 flex-1 rounded-ctrl border border-line bg-surface px-2 text-sm text-ink-1 outline-none focus:border-brand"
            value={filter === 'all' ? '' : String(filter)}
            onChange={(e) => setFilter(e.target.value === '' ? 'all' : Number(e.target.value))}
          >
            <option value="">全部订阅</option>
            {webhooks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void load()}>
            <RefreshCw size={13} />
            刷新
          </Button>
        </div>

        {/* 记录列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <Spinner size={20} />
            </div>
          )}
          {!loading && error && (
            <p className="mx-5 my-4 rounded-ctrl bg-danger-light px-3 py-2 text-meta text-danger">{error}</p>
          )}
          {!loading && !error && list.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-3">暂无投递记录</p>
          )}
          {list.map((d) => (
            <div key={d.id} className="border-b border-line">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm transition-colors hover:bg-sunken"
                onClick={() => setExpandedId((v) => (v === d.id ? null : d.id))}
              >
                {expandedId === d.id ? (
                  <ChevronDown size={14} className="shrink-0 text-ink-3" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-ink-3" />
                )}
                <span
                  className={cn(
                    'inline-block shrink-0 rounded-ctrl px-1.5 py-0.5 text-meta font-medium',
                    d.success ? 'bg-success-light text-success' : 'bg-danger-light text-danger',
                  )}
                >
                  {d.success ? '成功' : '失败'}
                </span>
                <span className="shrink-0 rounded-ctrl bg-sunken px-1.5 py-0.5 font-mono text-meta text-ink-3">
                  {d.event}
                </span>
                <span className="min-w-0 flex-1 truncate text-meta text-ink-3">
                  {filter === 'all' ? `${nameOf(d.webhookId)} · ` : ''}
                  响应 {d.respCode ?? '—'}
                  {d.error ? ` · ${d.error}` : ''}
                </span>
                <span className="shrink-0 text-meta text-ink-3">{fmtTs(d.createdAt)}</span>
              </button>
              {/* 展开查看 payload 全文与错误信息 */}
              {expandedId === d.id && (
                <div className="px-5 pb-3">
                  {d.error && (
                    <p className="mb-1.5 break-all rounded-ctrl bg-danger-light px-2.5 py-1.5 text-meta text-danger">
                      {d.error}
                    </p>
                  )}
                  <pre className="max-h-56 overflow-auto rounded-ctrl bg-sunken p-3 font-mono text-meta leading-relaxed text-ink-2">
                    {prettyJson(d.payload)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ==================== 主页面 ==================== */

export default function WebhooksPage() {
  const [list, setList] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // 新建订阅弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', events: '*', secret: '' })
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)

  // 删除确认 / 状态切换中 / 投递记录抽屉
  const [deleteTarget, setDeleteTarget] = useState<WebhookItem | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerFilter, setDrawerFilter] = useState<number | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await listWebhooks())
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 启用 / 停用订阅 */
  const toggleStatus = async (w: WebhookItem) => {
    const next: 1 | 2 = w.status === 1 ? 2 : 1
    setTogglingId(w.id)
    try {
      await updateWebhook(w.id, { name: w.name, url: w.url, events: w.events, status: next })
      toast.success(next === 1 ? '已启用' : '已停用')
      setList((prev) => prev.map((x) => (x.id === w.id ? { ...x, status: next } : x)))
    } catch {
      // 拦截器已提示
    } finally {
      setTogglingId(null)
    }
  }

  /** 提交新建订阅 */
  const submitCreate = async () => {
    const name = form.name.trim()
    const url = form.url.trim()
    if (!name) {
      setFormError('请输入订阅名称')
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      setFormError('URL 需以 http:// 或 https:// 开头')
      return
    }
    setCreating(true)
    setFormError('')
    try {
      await createWebhook({
        name,
        url,
        events: form.events.trim() || '*',
        ...(form.secret.trim() ? { secret: form.secret.trim() } : {}),
      })
      toast.success('订阅已创建')
      setCreateOpen(false)
      void load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6">
        <Webhook size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · Webhook 订阅</h1>
        <Link
          to="/admin/license"
          className="ml-auto flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <BadgeCheck size={14} /> License 授权
        </Link>
        <Link
          to="/admin/apikeys"
          className="flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <FileKey size={14} /> 开放 API 密钥
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
        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              setForm({ name: '', url: '', events: '*', secret: '' })
              setFormError('')
              setCreateOpen(true)
            }}
          >
            <Plus size={14} /> 新建订阅
          </Button>
          <Button
            onClick={() => {
              setDrawerFilter('all')
              setDrawerOpen(true)
            }}
          >
            <Inbox size={14} /> 投递记录
          </Button>
          <span className="text-meta text-ink-3">
            共 {list.length} 个订阅 · 事件命中后系统会向订阅 URL 发送 POST 请求
          </span>
        </div>

        {/* 订阅表格 */}
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          {loading && !loaded && (
            <div className="flex justify-center pb-3">
              <Spinner size={18} />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-meta font-medium text-ink-3">
                <th className="py-2.5 pr-4">名称</th>
                <th className="py-2.5 pr-4">URL</th>
                <th className="py-2.5 pr-4">事件</th>
                <th className="py-2.5 pr-4">状态</th>
                <th className="py-2.5 pr-4">创建时间</th>
                <th className="py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((w) => (
                <tr key={w.id} className="hover:bg-sunken">
                  <td className="py-2.5 pr-4 font-medium text-ink-1">{w.name}</td>
                  <td className="max-w-[240px] truncate py-2.5 pr-4 font-mono text-meta text-ink-3" title={w.url}>
                    {w.url}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-block whitespace-nowrap rounded-ctrl bg-sunken px-1.5 py-0.5 font-mono text-meta text-ink-3">
                      {eventsText(w.events)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusSwitch
                      value={w.status}
                      disabled={togglingId === w.id}
                      onChange={() => void toggleStatus(w)}
                    />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">{fmtTs(w.createdAt)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <button
                      type="button"
                      className="mr-3 rounded-ctrl px-1.5 py-1 text-meta text-ink-3 transition-colors hover:bg-sunken hover:text-brand"
                      onClick={() => {
                        setDrawerFilter(w.id)
                        setDrawerOpen(true)
                      }}
                    >
                      投递记录
                    </button>
                    <button
                      type="button"
                      className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-danger-light hover:text-danger"
                      title="删除订阅"
                      onClick={() => setDeleteTarget(w)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {loaded && list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <Inbox size={28} className="mx-auto mb-2 text-ink-3" />
                    还没有订阅，点击「新建订阅」创建
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* 新建订阅弹窗 */}
      <Dialog
        open={createOpen}
        title="新建订阅"
        width={480}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" loading={creating} onClick={() => void submitCreate()}>
              创建
            </Button>
          </>
        }
      >
        <DialogError message={formError} />
        <Input
          label="名称"
          placeholder="例如：发布通知机器人"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="URL"
          placeholder="https://example.com/hook"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
        <Input
          label="事件"
          placeholder="* 表示全部，多个用英文逗号分隔"
          value={form.events}
          onChange={(e) => setForm({ ...form, events: e.target.value })}
        />
        <Input
          label="密钥（选填，留空自动生成）"
          placeholder="用于请求签名校验"
          value={form.secret}
          onChange={(e) => setForm({ ...form, secret: e.target.value })}
        />
      </Dialog>

      {/* 删除订阅确认 */}
      <ConfirmDialog
        open={deleteTarget != null}
        title="删除订阅"
        danger
        confirmText="删除"
        content={`确定删除订阅「${deleteTarget?.name ?? ''}」吗？删除后不再向其推送事件。`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteWebhook(deleteTarget.id)
          toast.success('订阅已删除')
          setDeleteTarget(null)
          void load()
        }}
      />

      {/* 投递记录抽屉 */}
      <DeliveryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        webhooks={list}
        initialFilter={drawerFilter}
      />
    </div>
  )
}
