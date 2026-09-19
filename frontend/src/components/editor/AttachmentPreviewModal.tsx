/**
 * 附件在线预览弹窗（编辑态与阅读态的附件卡片共用）。
 *
 * 按扩展名分发渲染器：
 * - 图片 / 视频 / 音频：原生标签直接播放（无需 CORS）
 * - pdf：浏览器内置查看器（iframe 直链，零依赖高保真）
 * - docx：docx-preview（docxjs，高保真分页渲染）
 * - xlsx / xls / csv：SheetJS(xlsx) 解析 + 自绘表格（textContent 构建，天然防 XSS；支持合并单元格）
 * - pptx：pptx-preview（连续列表渲染幻灯片）
 * - 文本类（txt/md/json/代码）：fetch 文本 + pre 展示
 * - 其余（zip、旧版二进制 doc/ppt 等）：给出「不支持在线预览」+ 下载兜底
 *
 * 跨域说明：office/文本类需要 fetch 文件字节，文件在七牛（跨域）时统一走
 * 同源代理 /api/file-proxy?url=（后端域白名单）；媒体与 pdf 直链不需要。
 *
 * 交互：Esc / 遮罩 / 关闭按钮关闭；打开时锁定 body 滚动；关闭即卸载渲染器。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, File, Loader2, X } from 'lucide-react'
import type * as XLSXTypes from 'xlsx'
import { useAuthStore } from '../../store/authStore'
import { formatFileSize } from './MediaBlocks'

interface AttachmentPreviewModalProps {
  url: string
  name: string
  size: number | null
  onClose: () => void
}

type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'text'
  | 'unsupported'

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function kindOf(name: string): PreviewKind {
  const ext = extOf(name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (['txt', 'md', 'json', 'log', 'xml', 'yaml', 'yml', 'html', 'css', 'js', 'ts', 'sql', 'sh'].includes(ext))
    return 'text'
  return 'unsupported'
}

/** 同源直接取；跨域（七牛）走后端白名单代理，绕开 CORS。带登录态（代理端点需鉴权） */
function fetchableUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    if (u.origin === window.location.origin) return u.pathname + u.search
    return `/api/file-proxy?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}

/** 预览用 fetch：同源代理请求需要 Authorization 头；二进制场景不走 axios 信封解包 */
async function authedFetch(url: string): Promise<Response> {
  const token = useAuthStore.getState().accessToken
  return fetch(fetchableUrl(url), token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
}

/**
 * 强制下载附件（卡片下载按钮与预览弹窗共用）。
 * 跨域直链的 <a download> 会被浏览器忽略（图片会变成打开而非下载），
 * 因此统一走 fetch → blob → objectURL，保证所有类型都真正落盘；失败时兜底新窗口打开。
 */
export async function downloadAttachment(url: string, name: string): Promise<void> {
  try {
    const res = await authedFetch(url)
    if (!res.ok) throw new Error(`下载失败（${res.status}）`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 10_000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** 单元格显示值：优先格式化值 w，退化到原始值 */
function cellText(cell: Record<string, unknown> | undefined): string {
  if (!cell) return ''
  if (typeof cell.w === 'string') return cell.w
  const v = cell.v
  if (v === null || v === undefined) return ''
  return String(v)
}

/** 大表保护：预览场景限制行列数，避免卡死浏览器 */
const MAX_ROWS = 2000
const MAX_COLS = 100

/** 需要拉取字节后渲染的类型（其余为原生标签/静态提示，不进加载流程） */
const FETCH_KINDS: PreviewKind[] = ['docx', 'xlsx', 'pptx', 'text']

export default function AttachmentPreviewModal({ url, name, size, onClose }: AttachmentPreviewModalProps) {
  const kind = useMemo(() => kindOf(name), [name])
  const [loading, setLoading] = useState(FETCH_KINDS.includes(kind))
  const [error, setError] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [sheetNotice, setSheetNotice] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  /** xlsx 当前 renderSheet 闭包，供页签切换调用 */
  const renderSheetRef = useRef<((idx: number) => void) | null>(null)

  // Esc 关闭 + body 滚动锁（对齐 EmbedPreviewModal）
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // office / 文本类：fetch 字节后交给对应渲染库（重类型全部动态 import，按需加载）
  useEffect(() => {
    if (!FETCH_KINDS.includes(kind)) return
    let cancelled = false

    const run = async () => {
      const el = bodyRef.current
      if (!el) return
      try {
        const res = await authedFetch(url)
        if (!res.ok) throw new Error(`文件拉取失败（${res.status}）`)
        if (cancelled) return

        if (kind === 'text') {
          const text = await res.text()
          if (cancelled) return
          const pre = document.createElement('pre')
          pre.textContent = text
          pre.className =
            'm-0 whitespace-pre-wrap break-all p-5 font-mono text-[13px] leading-6 text-slate-700'
          el.replaceChildren(pre)
          setLoading(false)
          return
        }

        const buf = await res.arrayBuffer()
        if (cancelled) return

        if (kind === 'docx') {
          const { renderAsync } = await import('docx-preview')
          if (cancelled) return
          el.replaceChildren()
          await renderAsync(buf, el, undefined, {
            className: 'wiki-docx',
            inWrapper: true,
            breakPages: true,
          })
          setLoading(false)
          return
        }

        if (kind === 'pptx') {
          const { init } = await import('pptx-preview')
          if (cancelled) return
          el.replaceChildren()
          const width = Math.min(Math.max(el.clientWidth - 24, 320), 1100)
          const viewer = init(el, { width, mode: 'list' })
          await viewer.preview(buf)
          if (cancelled) viewer.destroy()
          setLoading(false)
          return
        }

        // xlsx / xls / csv：SheetJS 解析 + textContent 自绘表格（防 XSS，支持合并单元格）
        const XLSX = await import('xlsx')
        if (cancelled) return
        const wb = XLSX.read(buf, { type: 'array' })
        setSheetNames(wb.SheetNames)
        setActiveSheet(0)
        setLoading(false)

        const renderSheet = (idx: number) => {
          const ws = wb.Sheets[wb.SheetNames[idx]] as XLSXTypes.WorkSheet | undefined
          if (!ws || !ws['!ref']) {
            el.replaceChildren()
            setSheetNotice('')
            return
          }
          const range = XLSX.utils.decode_range(ws['!ref'])
          const endRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1)
          const endCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1)
          setSheetNotice(
            range.e.r - range.s.r + 1 > MAX_ROWS || range.e.c - range.s.c + 1 > MAX_COLS
              ? `内容较大，仅预览前 ${endRow - range.s.r + 1} 行 × ${endCol - range.s.c + 1} 列`
              : ''
          )
          const merges = (ws['!merges'] ?? []) as XLSXTypes.Range[]
          // 被合并覆盖的格子跳过不渲染，起始格补 rowSpan/colSpan
          const covered = new Set<string>()
          const spanAt = new Map<string, XLSXTypes.Range>()
          for (const m of merges) {
            spanAt.set(`${m.s.r}:${m.s.c}`, m)
            for (let r = m.s.r; r <= m.e.r; r++) {
              for (let c = m.s.c; c <= m.e.c; c++) {
                if (r !== m.s.r || c !== m.s.c) covered.add(`${r}:${c}`)
              }
            }
          }
          const table = document.createElement('table')
          table.className = 'wiki-xlsx-table'
          const thead = document.createElement('thead')
          const headerTr = document.createElement('tr')
          for (let c = range.s.c; c <= endCol; c++) {
            const th = document.createElement('th')
            th.textContent = XLSX.utils.encode_col(c)
            headerTr.appendChild(th)
          }
          thead.appendChild(headerTr)
          table.appendChild(thead)
          const tbody = document.createElement('tbody')
          for (let r = range.s.r; r <= endRow; r++) {
            const tr = document.createElement('tr')
            for (let c = range.s.c; c <= endCol; c++) {
              if (covered.has(`${r}:${c}`)) continue
              const td = document.createElement(r === range.s.r ? 'th' : 'td')
              td.textContent = cellText(ws[XLSX.utils.encode_cell({ r, c })] as Record<string, unknown>)
              const m = spanAt.get(`${r}:${c}`)
              if (m) {
                if (m.e.r > m.s.r) td.rowSpan = Math.min(m.e.r, endRow) - r + 1
                if (m.e.c > m.s.c) td.colSpan = Math.min(m.e.c, endCol) - c + 1
              }
              tr.appendChild(td)
            }
            tbody.appendChild(tr)
          }
          table.appendChild(tbody)
          el.replaceChildren(table)
        }
        renderSheetRef.current = renderSheet
        renderSheet(0)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '预览失败')
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      cancelled = true
      renderSheetRef.current = null
    }
  }, [kind, url])

  const pickSheet = (idx: number) => {
    setActiveSheet(idx)
    renderSheetRef.current?.(idx)
  }

  /** fetch 渲染类的容器（effect 需要 ref），其余类型走 JSX 原生渲染 */
  const needsBody = FETCH_KINDS.includes(kind)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex h-[88vh] w-[90vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏：图标 + 文件名 + 大小 + 下载 + 关闭 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <File size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{name}</div>
            {formatFileSize(size) && <div className="text-[11px] text-slate-400">{formatFileSize(size)}</div>}
          </div>
          <button
            onClick={() => void downloadAttachment(url, name)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <Download size={13} />
            下载
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* xlsx sheet 页签（多 sheet 时显示） */}
        {kind === 'xlsx' && sheetNames.length > 1 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-1.5">
            {sheetNames.map((sn, i) => (
              <button
                key={sn}
                onClick={() => pickSheet(i)}
                className={`shrink-0 rounded-md px-3 py-1 text-xs transition-colors ${
                  i === activeSheet ? 'bg-white font-medium text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {sn}
              </button>
            ))}
          </div>
        )}
        {kind === 'xlsx' && sheetNotice && (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-600">
            {sheetNotice}
          </div>
        )}

        {/* 预览主体：原生类型直接渲染；fetch 类容器常驻（effect 需要 ref），加载/错误用浮层 */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-50">
          {kind === 'image' && (
            <div className="flex min-h-full items-center justify-center p-6">
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {kind === 'video' && (
            <div className="flex min-h-full items-center justify-center bg-black p-4">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={url} controls autoPlay className="max-h-full max-w-full" />
            </div>
          )}
          {kind === 'audio' && (
            <div className="flex min-h-full items-center justify-center p-6">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={url} controls autoPlay className="w-full max-w-xl" />
            </div>
          )}
          {kind === 'pdf' && <iframe src={url} title={name} className="h-full w-full border-0 bg-white" />}
          {kind === 'unsupported' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <File size={32} className="text-slate-300" />
                  <span>该格式暂不支持在线预览，请下载后查看</span>
                  <button
                    onClick={() => void downloadAttachment(url, name)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600"
                  >
                    下载文件
                  </button>
            </div>
          )}
          {needsBody && <div ref={bodyRef} className={kind === 'xlsx' || kind === 'pptx' ? 'p-3' : ''} />}

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-slate-50 text-sm text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              正在加载预览…
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50 text-sm text-slate-500">
              <AlertTriangle size={32} className="text-amber-400" />
              <span>预览失败：{error}</span>
              <button
                onClick={() => void downloadAttachment(url, name)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600"
              >
                下载文件
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
