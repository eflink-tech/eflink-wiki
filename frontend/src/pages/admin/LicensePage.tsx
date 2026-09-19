/**
 * 管理后台 · License 授权页（路由 /admin/license）：
 * 授权状态卡片（有效状态徽标 / 被授权方 / 到期日期 / 用户数 / 功能开关）+ 授权文件上传。
 * 页面样式与操作审计页保持一致（独立顶栏，仅系统管理员可访问，路由层做守卫）。
 */
import { ArrowLeft, BadgeCheck, RefreshCw, Upload, Webhook, FileKey } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../../api/client'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import { cn } from '../../lib/utils'

/** License 授权状态（后端 /admin/license 返回） */
interface LicenseInfo {
  /** 是否已上传过授权文件 */
  present: boolean
  /** 当前授权是否有效 */
  valid: boolean
  /** 无效原因（验签失败/已过期等） */
  reason: string | null
  /** 被授权方 */
  licensee: string | null
  /** 到期时间（毫秒时间戳或 ISO 字符串） */
  expiresAt: number | string | null
  /** 授权用户数上限（null 表示不限） */
  maxUsers: number | null
  /** 当前已用用户数 */
  usedUsers: number
  /** 已解锁的功能开关 */
  features: string[]
}

/** 读取 License 状态 */
const getLicense = () => request<LicenseInfo>({ url: '/admin/license', method: 'GET' })

/** 上传授权文件（multipart，字段名 file），后端验签后返回最新状态 */
const uploadLicense = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<LicenseInfo>({
    url: '/admin/license',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 日期格式化：毫秒时间戳 / 秒级时间戳 / ISO 字符串 → 'YYYY-MM-DD' */
function fmtDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  const ms =
    typeof value === 'number'
      ? value < 1e12
        ? value * 1000
        : value
      : /^\d+$/.test(value)
        ? Number(value) < 1e12
          ? Number(value) * 1000
          : Number(value)
        : Date.parse(value)
  if (Number.isNaN(ms)) return String(value)
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 授权状态徽标：有效绿 / 无效（含过期）红 / 未授权灰 */
function StatusBadge({ info }: { info: LicenseInfo }) {
  if (!info.present) {
    return (
      <span className="rounded-ctrl bg-sunken px-2 py-0.5 text-meta text-ink-3">未授权</span>
    )
  }
  if (info.valid) {
    return (
      <span className="rounded-ctrl bg-success-light px-2 py-0.5 text-meta font-medium text-success">
        有效
      </span>
    )
  }
  return (
    <span className="rounded-ctrl bg-danger-light px-2 py-0.5 text-meta font-medium text-danger">
      {info.reason || '无效'}
    </span>
  )
}

/** 状态卡片的单格信息 */
function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-meta text-ink-3">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-ink-1">{children}</p>
    </div>
  )
}

/** License 授权页（默认导出） */
export default function LicensePage() {
  const [info, setInfo] = useState<LicenseInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await getLicense())
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 选择文件后立即上传验签 */
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 清空以允许重复选择同一文件
    if (!file) return
    setUploading(true)
    try {
      setInfo(await uploadLicense(file))
      toast.success('授权文件已导入')
    } catch {
      // 验签失败（如 406）等错误由拦截器统一提示
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6">
        <BadgeCheck size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · License 授权</h1>
        <Link
          to="/admin/webhooks"
          className="ml-auto flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <Webhook size={14} /> Webhook 订阅
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

      <main className="mx-auto max-w-3xl p-6">
        {/* 授权状态卡片 */}
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-1">授权状态</h2>
            {info && <StatusBadge info={info} />}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              loading={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={13} />
              刷新
            </Button>
          </div>

          {loading && !info && (
            <div className="flex justify-center py-10">
              <Spinner size={20} />
            </div>
          )}

          {info && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <InfoCell label="被授权方">{info.licensee || '—'}</InfoCell>
                <InfoCell label="到期日期">{fmtDate(info.expiresAt)}</InfoCell>
                <InfoCell label="用户数">
                  {info.usedUsers} / {info.maxUsers == null ? '不限' : info.maxUsers}
                </InfoCell>
                <InfoCell label="功能开关">
                  {info.features.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {info.features.map((f) => (
                        <span
                          key={f}
                          className={cn(
                            'rounded-ctrl bg-brand-light px-1.5 py-0.5 text-meta font-normal text-brand',
                          )}
                        >
                          {f}
                        </span>
                      ))}
                    </span>
                  ) : (
                    '—'
                  )}
                </InfoCell>
              </div>
              {/* 无效原因说明 */}
              {info.present && !info.valid && info.reason && (
                <p className="mt-4 rounded-ctrl bg-danger-light px-3 py-2 text-meta text-danger">
                  {info.reason}
                </p>
              )}
            </>
          )}
        </div>

        {/* 上传区域 */}
        <div className="mt-4 rounded-card border border-dashed border-line bg-surface p-8 text-center">
          <Upload size={24} className={cn('mx-auto', uploading ? 'animate-bounce text-brand' : 'text-ink-3')} />
          <p className="mt-3 text-sm text-ink-2">导入新的授权文件</p>
          <p className="mt-1 text-meta text-ink-3">
            选择文件后立即上传验签并生效；验签失败会提示具体原因
          </p>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => void handleFile(e)} />
          <Button
            variant="primary"
            className="mt-4"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            选择文件上传
          </Button>
        </div>
      </main>
    </div>
  )
}
