/**
 * 公开分享页：/share/:token
 * 只读展示页面已发布版本；访问范围由后端按链接配置校验
 * （0 任何人可读 / 1 登录用户可读 / 2 仅空间成员）。
 */
import { ArrowLeft, FileText, Loader2, Lock, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as wikiApi from '../api/wiki'
import type { SharedPage } from '../api/wiki'
import { Button } from '../components/Button'
import WikiEditor from '../components/editor/WikiEditor'
import { useAuthStore } from '../store/authStore'
import logoUrl from '../assets/wiki-logo.png'

/** 毫秒时间戳 → 'YYYY-MM-DD HH:mm' */
function fmtTs(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ACCESS_LABEL: Record<number, string> = {
  0: '公开链接',
  1: '登录后可读',
  2: '仅空间成员',
}

export default function ShareViewPage() {
  const { token = '' } = useParams()
  const loggedIn = useAuthStore((s) => s.accessToken != null)
  const [page, setPage] = useState<SharedPage | null>(null)
  const [error, setError] = useState<{ code: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    wikiApi
      .getSharedPage(token)
      .then((res) => {
        if (alive) setPage(res)
      })
      .catch((e: unknown) => {
        const err = e as { code?: number; message?: string }
        if (alive) setError({ code: err?.code ?? 0, message: err?.message ?? '分享页加载失败' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [token, reloadKey])

  const loginHref = '/login'

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1080px] items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2 text-ink-1">
            <img src={logoUrl} alt="易飞知识库" className="h-6 w-6 rounded" />
            <span className="truncate text-sm font-semibold">易飞知识库</span>
          </Link>
          {page && (
            <>
              <span className="text-ink-3">/</span>
              <span className="min-w-0 truncate text-sm text-ink-2">
                {page.spaceName ?? '知识空间'}
              </span>
              <span className="ml-2 hidden shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-3 sm:inline">
                {ACCESS_LABEL[page.access] ?? '分享链接'}
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {loggedIn ? (
              <Link
                to="/app"
                className="flex items-center gap-1 text-meta text-ink-2 transition-colors hover:text-brand"
              >
                <ArrowLeft size={14} /> 回到知识库
              </Link>
            ) : (
              <Link to="/login" state={{ from: { pathname: `/share/${token}` } }}>
                <Button size="sm" variant="default">
                  登录
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 正文 */}
      <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-24 text-ink-3">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">正在加载分享页…</span>
          </div>
        )}

        {!loading && error && (() => {
          const heading =
            error.code === 401
              ? '该分享需要登录后查看'
              : error.code === 410
                ? '分享链接已过期'
                : error.code === 404
                  ? '分享链接不存在或已撤销'
                  : '分享页加载失败'
          return (
            <div className="mx-auto mt-16 max-w-[420px] rounded-pop border border-line bg-surface px-6 py-10 text-center shadow-2">
              {error.code === 401 ? (
                <Lock size={28} className="mx-auto mb-3 text-warning" />
              ) : (
                <ShieldAlert size={28} className="mx-auto mb-3 text-ink-3" />
              )}
              <h1 className="text-base font-semibold text-ink-1">{heading}</h1>
              {error.message !== heading && (
                <p className="mt-2 text-sm text-ink-3">{error.message}</p>
              )}
              <div className="mt-5 flex justify-center gap-2">
                {error.code === 401 && !loggedIn && (
                  <Link to={loginHref} state={{ from: { pathname: `/share/${token}` } }}>
                    <Button variant="primary" size="sm">
                      登录查看
                    </Button>
                  </Link>
                )}
                {error.code !== 404 && error.code !== 410 && (
                  <Button variant="default" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                    重新加载
                  </Button>
                )}
              </div>
            </div>
          )
        })()}

        {!loading && !error && page && (
          <article>
            <h1 className="break-words text-title font-semibold text-ink-1">{page.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-4 text-meta text-ink-3">
              <span className="flex items-center gap-1">
                <FileText size={13} />
                {page.versionNo != null ? `v${page.versionNo}` : '未发布'}
              </span>
              {page.publishedByName && <span>发布人 {page.publishedByName}</span>}
              {page.publishedAt && <span>{fmtTs(page.publishedAt)}</span>}
              {page.expiresAt && <span>链接有效期至 {fmtTs(page.expiresAt)}</span>}
            </div>
            <div className="mt-6">
              {page.content ? (
                <WikiEditor key={`share-${page.nodeId}-${page.versionNo ?? 0}`} initialContent={page.content} editable={false} />
              ) : (
                <p className="py-12 text-center text-sm text-ink-3">该页面还没有已发布的内容</p>
              )}
            </div>
            <footer className="mt-14 border-t border-line pt-5 text-xs text-ink-3">
              本页通过分享链接只读展示
              {page.ownerName ? ` · 空间负责人 ${page.ownerName}` : ''}
              {page.spaceName ? ` · ${page.spaceName}` : ''}
            </footer>
          </article>
        )}
      </main>
    </div>
  )
}
