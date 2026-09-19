/**
 * 管理后台 · 开放 API 密钥页（路由 /admin/apikeys）：
 * 密钥表格（名称/前缀/最近使用/创建时间/删除确认）+ 创建密钥弹窗，
 * 创建成功后大号展示完整密钥（仅显示一次）并支持一键复制。
 * 页面样式与操作审计页保持一致（独立顶栏，仅系统管理员可访问，路由层做守卫）。
 */
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  FileKey,
  KeyRound,
  Plus,
  Trash2,
  TriangleAlert,
  Webhook,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../../api/client'
import { Button } from '../../components/Button'
import { ConfirmDialog, Dialog, DialogError } from '../../components/Dialog'
import { Input } from '../../components/Input'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'

/** API 密钥条目（完整密钥仅在创建成功时返回一次） */
interface ApiKeyItem {
  id: number
  name: string
  /** 密钥前缀（脱敏展示） */
  keyPrefix: string
  status?: number
  lastUsedAt: number | string | null
  createdAt: number | string | null
}

/* ---------------- API ---------------- */

/** 密钥列表（兼容数组或 { list } 两种返回形态） */
async function listApiKeys(): Promise<ApiKeyItem[]> {
  const res = await request<ApiKeyItem[] | { list?: ApiKeyItem[] }>({
    url: '/admin/apikeys',
    method: 'GET',
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/** 创建密钥：完整密钥仅本次响应返回 */
const createApiKey = (name: string) =>
  request<{ id: number; name: string; apiKey: string }>({
    url: '/admin/apikeys',
    method: 'POST',
    data: { name },
  })

/** 删除密钥（删除后调用方立即失效） */
const deleteApiKey = (id: number) =>
  request<null>({ url: `/admin/apikeys/${id}`, method: 'DELETE' })

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

/** 复制文本到剪贴板（非安全上下文降级为 execCommand） */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动复制')
    }
    ta.remove()
  }
}

/** API 密钥页（默认导出） */
export default function ApiKeysPage() {
  const [list, setList] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // 创建弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)

  // 创建成功：完整密钥仅此一次展示
  const [created, setCreated] = useState<{ name: string; apiKey: string } | null>(null)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await listApiKeys())
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

  /** 提交创建：成功后弹出一次性完整密钥展示 */
  const submitCreate = async () => {
    const v = name.trim()
    if (!v) {
      setFormError('请输入密钥名称')
      return
    }
    setCreating(true)
    setFormError('')
    try {
      const r = await createApiKey(v)
      setCreateOpen(false)
      setCreated({ name: r.name, apiKey: r.apiKey })
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
        <FileKey size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · 开放 API 密钥</h1>
        <Link
          to="/admin/license"
          className="ml-auto flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <BadgeCheck size={14} /> License 授权
        </Link>
        <Link
          to="/admin/webhooks"
          className="flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <Webhook size={14} /> Webhook 订阅
        </Link>
        <Link
          to="/app"
          className="flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <ArrowLeft size={14} />
          返回知识库
        </Link>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              setName('')
              setFormError('')
              setCreateOpen(true)
            }}
          >
            <Plus size={14} /> 创建密钥
          </Button>
          <span className="text-meta text-ink-3">
            共 {list.length} 个密钥 · 完整密钥仅在创建时显示一次
          </span>
        </div>

        {/* 密钥表格 */}
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
                <th className="py-2.5 pr-4">密钥前缀</th>
                <th className="py-2.5 pr-4">最近使用</th>
                <th className="py-2.5 pr-4">创建时间</th>
                <th className="py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((k) => (
                <tr key={k.id} className="hover:bg-sunken">
                  <td className="py-2.5 pr-4 font-medium text-ink-1">{k.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-meta text-ink-3">{k.keyPrefix}…</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">
                    {fmtTs(k.lastUsedAt)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">
                    {fmtTs(k.createdAt)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <button
                      type="button"
                      className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-danger-light hover:text-danger"
                      title="删除密钥"
                      onClick={() => setDeleteTarget(k)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {loaded && list.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-ink-3">
                    <KeyRound size={28} className="mx-auto mb-2 text-ink-3" />
                    还没有密钥，点击「创建密钥」生成
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* 创建密钥弹窗 */}
      <Dialog
        open={createOpen}
        title="创建密钥"
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
          label="密钥名称"
          autoFocus
          placeholder="例如：CI 集成"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitCreate()
          }}
        />
        <p className="-mt-1 text-meta text-ink-3">创建成功后仅显示一次完整密钥，请提前准备好保存位置。</p>
      </Dialog>

      {/* 创建成功：完整密钥一次性展示 */}
      {created && (
        <Dialog
          open
          title="密钥已创建"
          width={520}
          onClose={() => setCreated(null)}
          footer={
            <Button variant="primary" onClick={() => setCreated(null)}>
              我已保存，关闭
            </Button>
          }
        >
          <div className="mb-3 flex items-start gap-2 rounded-ctrl border border-warning bg-warning-light px-3 py-2.5 text-meta text-warning-ink">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            完整密钥仅显示这一次，关闭后无法再次查看，请立即复制并妥善保存。
          </div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">{created.name}</p>
          <div className="flex items-center gap-2">
            <code
              title={created.apiKey}
              className="min-w-0 flex-1 break-all rounded-ctrl bg-ink-1 px-3 py-3 font-mono text-[15px] leading-relaxed text-success"
            >
              {created.apiKey}
            </code>
            <Button className="shrink-0" onClick={() => void copyText(created.apiKey)}>
              <Copy size={14} />
              复制
            </Button>
          </div>
          <p className="mt-2 text-meta text-ink-3">
            请将该密钥按后端约定放入请求头调用开放 API；密钥泄露时请立即删除并重新创建。
          </p>
        </Dialog>
      )}

      {/* 删除密钥确认 */}
      <ConfirmDialog
        open={deleteTarget != null}
        title="删除密钥"
        danger
        confirmText="删除"
        content={`确定删除密钥「${deleteTarget?.name ?? ''}」吗？使用该密钥的调用将立即失效，此操作不可恢复。`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteApiKey(deleteTarget.id)
          toast.success('密钥已删除')
          setDeleteTarget(null)
          void load()
        }}
      />
    </div>
  )
}
