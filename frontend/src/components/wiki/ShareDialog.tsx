/**
 * 页面分享链接设置：访问范围（公开 / 登录可读 / 仅空间成员）+ 有效期 + 复制 / 撤销。
 * 一个页面同时只保留一条分享链接，重复保存覆盖原设置（令牌不变）。
 */
import { Check, Copy, Link2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import * as wikiApi from '../../api/wiki'
import type { ShareConfig } from '../../api/wiki'
import { Button } from '../Button'
import { ConfirmDialog, Dialog, DialogError } from '../Dialog'
import { toast } from '../Toast'
import { cn } from '../../lib/utils'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  nodeId: number
  /** 空间编辑者及以上才能保存 / 撤销 */
  canEdit: boolean
}

const ACCESS_OPTIONS: { value: number; label: string; desc: string }[] = [
  { value: 0, label: '任何人可读', desc: '拿到链接即可查看，无需登录' },
  { value: 1, label: '登录用户可读', desc: '需登录易飞知识库账号' },
  { value: 2, label: '仅空间成员', desc: '仅本空间成员可查看' },
]

const EXPIRY_OPTIONS = [
  { value: 0, label: '永久有效' },
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
]

/** 毫秒时间戳 → 'YYYY-MM-DD HH:mm' */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ShareDialog({ open, onClose, nodeId, canEdit }: ShareDialogProps) {
  const [config, setConfig] = useState<ShareConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [access, setAccess] = useState(0)
  const [expiryDays, setExpiryDays] = useState(0)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await wikiApi.getShareConfig(nodeId)
      setConfig(res)
      setAccess(res.access)
      // 已有过期时间时回退为「永久」，避免误把有效期越改越短
      setExpiryDays(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取分享设置失败')
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const link = config?.token ? `${window.location.origin}/share/${config.token}` : ''

  const save = async () => {
    setSaving(true)
    try {
      const res = await wikiApi.saveShareConfig(nodeId, {
        access,
        expiresInDays: expiryDays > 0 ? expiryDays : null,
      })
      setConfig(res)
      toast.success('分享设置已保存')
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      toast.success('分享链接已复制')
    } catch {
      toast.error('复制失败，请手动选择链接复制')
    }
  }

  const revoke = async () => {
    try {
      await wikiApi.revokeShareConfig(nodeId)
      toast.success('分享链接已撤销')
      setConfig((c) => (c ? { ...c, enabled: false, token: null } : c))
    } catch {
      // 拦截器已提示
    }
  }

  return (
    <>
      <Dialog
        open={open}
        title="分享链接"
        onClose={onClose}
        width={480}
        footer={
          canEdit ? (
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {config?.enabled ? '保存设置' : '创建分享链接'}
            </Button>
          ) : (
            <Button variant="default" onClick={onClose}>
              关闭
            </Button>
          )
        }
      >
        {loading && <p className="py-6 text-center text-sm text-ink-3">正在读取分享设置…</p>}
        {!loading && error && <DialogError message={error} />}

        {!loading && !error && (
          <div className="space-y-4">
            <p className="text-meta text-ink-3">
              分享页展示当前已发布版本；撤销后原地址立即失效。
            </p>

            <div>
              <div className="mb-1.5 text-meta font-medium text-ink-2">访问范围</div>
              <div className="space-y-1.5">
                {ACCESS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={!canEdit}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-ctrl border px-3 py-2 text-left transition-colors',
                      access === o.value
                        ? 'border-brand bg-brand-light'
                        : 'border-line bg-surface hover:bg-sunken',
                      !canEdit && 'cursor-default opacity-70',
                    )}
                    onClick={() => canEdit && setAccess(o.value)}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        access === o.value ? 'border-brand bg-brand text-white' : 'border-line-strong',
                      )}
                    >
                      {access === o.value && <Check size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-ink-1">{o.label}</span>
                      <span className="block text-xs text-ink-3">{o.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {canEdit && (
              <label className="flex items-center justify-between gap-3">
                <span className="text-meta font-medium text-ink-2">有效期</span>
                <select
                  value={expiryDays}
                  className="h-9 rounded-ctrl border border-line bg-surface px-2.5 text-sm text-ink-1 outline-none focus:border-brand"
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config?.enabled && link && (
              <div>
                <div className="mb-1.5 text-meta font-medium text-ink-2">分享地址</div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-ctrl bg-sunken px-2.5">
                    <Link2 size={14} className="shrink-0 text-ink-3" />
                    <input
                      readOnly
                      value={link}
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink-2 outline-none"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                  <Button variant="default" size="sm" onClick={() => void copy()}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-3">
                  <span>
                    {config.expiresAt ? `有效期至 ${fmtTs(config.expiresAt)}` : '永久有效'}
                    {config.createdAt ? ` · 创建于 ${fmtTs(config.createdAt)}` : ''}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-ink-3 transition-colors hover:text-danger"
                      onClick={() => setRevokeOpen(true)}
                    >
                      <Trash2 size={12} /> 撤销分享
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={revokeOpen}
        title="撤销分享链接"
        danger
        confirmText="撤销"
        onClose={() => setRevokeOpen(false)}
        onConfirm={revoke}
        content="撤销后该链接立即失效，已发出的地址将无法访问。确定撤销吗？"
      />
    </>
  )
}
