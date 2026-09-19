/**
 * 页面阅读/编辑双态视图（对齐 ONES 文档体验）。
 *
 * 双态分路径：阅读（预览）/app/space/:spaceId/page/:nodeId，编辑 …/page/:nodeId/edit；
 * 模式完全由 URL 决定（可直达 /edit 进入编辑，无编辑权限者自动回退阅读态）。
 *
 * 数据流：
 * - 进入页面并发拉取 getPage（已发布）与 getDraft（我的草稿）
 * - 有草稿：细条警示提示（继续编辑 / 查看已发布 / 放弃修改）
 * - 阅读态：元信息 + 只读渲染；操作：编辑（需空间角色≥2）、版本历史、收藏、另存为模板、
 *   演示（?present=1 全屏大屏）、导出（Markdown / Word / PDF 文件下载）
 * - presence 软锁：他人正在编辑本页时阅读态显示提示条，进入编辑态前弹确认
 * - 编辑态：草稿??已发布 载入编辑器；标题可直接改（失焦/回车写节点并刷新树）；
 *   2s 防抖自动保存草稿；Ctrl/Cmd+S 立即保存；
 *   「发布」= 先存草稿再发布（发布用页面标题），成功后回阅读态并刷新；支持导入
 *   Markdown / HTML 内容到光标处
 * - 版本抽屉：版本列表 / 只读 JSON 树预览 / 与当前版本行级 diff / 回滚（写入草稿后进编辑态）
 */
import {
  ChevronDown,
  Download,
  Eye,
  FileDown,
  FileText,
  GitCompare,
  History,
  Import,
  Link2,
  ListTree,
  LogOut,
  Maximize,
  Maximize2,
  Minimize2,
  Pencil,
  RotateCcw,
  Star,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
import type { Editor, JSONContent } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import type { CollabSession } from '../../components/editor/WikiEditor'
import { useAuthStore } from '../../store/authStore'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as wikiApi from '../../api/wiki'
import { listMembers } from '../../api/wiki'
import type { NodeDraft, NodePage, Space } from '../../api/types'
import type { VersionItem } from '../../api/wiki'
import { request } from '../../api/client'
import { Button } from '../../components/Button'
import CommentPanel from '../../components/wiki/CommentPanel'
import { ConfirmDialog, Dialog, DialogError } from '../../components/Dialog'
import { Dropdown, DropdownItem } from '../../components/Dropdown'
import { Input, Textarea } from '../../components/Input'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import WikiEditor from '../../components/editor/WikiEditor'
import { formatFileSize } from '../../components/editor/MediaBlocks'
import { TocPanel } from '../../components/editor/PageFloatingTools'
import EmbedPreviewModal from '../../components/editor/EmbedPreviewModal'
import {
  EMBED_PREVIEW_EVENT,
  type EmbedPreviewDetail,
} from '../../components/editor/EmbedPreview'
import { useEditorPrefsStore } from '../../store/editorPrefsStore'
import { diffContents, type DiffRow } from '../../components/editor/diff'
import { jsonToMarkdown, markdownToJson, type PMNode } from '../../lib/markdown'
import { preparePageTitle } from '../../lib/pageTitle'
import { emitTreeChanged } from '../../lib/events'
import { captureElementPdf, sanitizePdfBasename } from '../../lib/pagePdf'
import { applyPublishedSnapshot } from '../../lib/publishSnapshot'
import { cn } from '../../lib/utils'

/** 页面阅读数据 + 后端额外返回的字段（发布人/是否已收藏/正在编辑的其他用户） */
type PageDetail = NodePage & {
  publishedByName?: string | null
  favorited?: boolean
  /** 正在编辑本页的其他用户姓名（presence 软锁，非空表示 10 分钟内有人保存过草稿） */
  editingUsers?: string[]
}

/** 静默读取我的草稿（查看者无权限/无草稿时不弹全局错误提示） */
function getDraftSilent(nodeId: number): Promise<NodeDraft | null> {
  return request<NodeDraft | null>({
    url: `/wiki/nodes/${nodeId}/draft`,
    method: 'GET',
    _silent: true,
  }).catch(() => null)
}

/** 格式化时间戳（后端多为毫秒数；兼容 ISO字符串） */
function fmtTs(value: number | string | null | undefined, withTime = true): string {
  if (value === null || value === undefined || value === '') return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

/* ==================== 导出辅助（Markdown / Word / PDF） ==================== */

/** 触发浏览器下载一个 Blob */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** HTML 特殊字符转义 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 行内内容 → HTML（hardBreak → <br>，image → <img>，文本转义） */
function inlineHtml(node: PMNode): string {
  const parts: string[] = []
  for (const child of node.content ?? []) {
    const t = child.type.toLowerCase().replace(/_/g, '')
    if (t === 'hardbreak') {
      parts.push('<br />')
    } else if (t === 'image') {
      parts.push(
        `<img src="${escapeHtml(String(child.attrs?.src ?? ''))}" alt="${escapeHtml(String(child.attrs?.alt ?? ''))}" />`,
      )
    } else if (t === 'text') {
      parts.push(escapeHtml(child.text ?? ''))
    } else {
      parts.push(inlineHtml(child))
    }
  }
  return parts.join('')
}

/** 单个块级节点 → HTML（覆盖 P1 编辑器块集合，供 Word 导出使用） */
function blockHtml(node: PMNode): string {
  const t = node.type.toLowerCase().replace(/_/g, '')
  const attrs = node.attrs ?? {}
  switch (t) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(attrs.level ?? 1) || 1))
      return `<h${level}>${inlineHtml(node)}</h${level}>`
    }
    case 'paragraph':
      return `<p>${inlineHtml(node)}</p>`
    case 'bulletlist':
      return `<ul>${(node.content ?? []).map(blockHtml).join('')}</ul>`
    case 'orderedlist': {
      const start = Number(attrs.start ?? 1) || 1
      return `<ol start="${start}">${(node.content ?? []).map(blockHtml).join('')}</ol>`
    }
    case 'tasklist':
      return `<ul>${(node.content ?? []).map(blockHtml).join('')}</ul>`
    case 'listitem':
    case 'taskitem': {
      const checked = attrs.checked === true
      const inner = (node.content ?? []).map(blockHtml).join('')
      return `<li>${t === 'taskitem' ? (checked ? '☑ ' : '☐ ') : ''}${inner}</li>`
    }
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(blockHtml).join('')}</blockquote>`
    case 'codeblock': {
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return `<pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;"><code>${escapeHtml(code)}</code></pre>`
    }
    case 'horizontalrule':
      return '<hr />'
    case 'image':
      return `<p><img src="${escapeHtml(String(attrs.src ?? ''))}" alt="${escapeHtml(String(attrs.alt ?? ''))}" /></p>`
    case 'table':
      return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;">${(node.content ?? []).map(blockHtml).join('')}</table>`
    case 'tablerow':
      return `<tr>${(node.content ?? []).map(blockHtml).join('')}</tr>`
    case 'tableheader':
      return `<th style="background:#f0f0f0;">${inlineHtml(node)}</th>`
    case 'tablecell':
      return `<td>${inlineHtml(node)}</td>`
    case 'embedcard': {
      const title = String(attrs.title ?? '')
      const type = String(attrs.type ?? attrs.embedType ?? '')
      return `<p>【嵌入】${escapeHtml(title)}（${escapeHtml(type)}）</p>`
    }
    case 'attachment': {
      const name = String(attrs.name ?? '')
      const url = String(attrs.url ?? '')
      const size = formatFileSize(Number(attrs.size) || 0)
      return `<p>【附件】<a href="${escapeHtml(url)}">${escapeHtml(name)}</a>${size ? `（${escapeHtml(size)}）` : ''}</p>`
    }
    case 'wikivideo':
    case 'video':
      return `<p>【视频】<a href="${escapeHtml(String(attrs.src ?? ''))}">点击播放</a></p>`
    case 'wikiaudio':
    case 'audio':
      return `<p>【音频】<a href="${escapeHtml(String(attrs.src ?? ''))}">点击播放</a></p>`
    case 'webembed':
      return `<p>【网页】<a href="${escapeHtml(String(attrs.src ?? ''))}">${escapeHtml(String(attrs.src ?? ''))}</a></p>`
    case 'pageref':
      return `<p>【子页面】${escapeHtml(String(attrs.title ?? ''))}</p>`
    case 'columns': {
      // Word 导出不支持多栏，各栏内容顺序平铺
      return (node.content ?? []).map(blockHtml).join('')
    }
    case 'column':
      return (node.content ?? []).map(blockHtml).join('')
    default:
      // 未知块级节点：尽力递归渲染其子块
      return (node.content ?? []).map(blockHtml).join('')
  }
}

/** ProseMirror JSON 字符串 → 简易 HTML；解析失败按纯文本段落降级 */
function jsonToHtml(doc: string): string {
  if (!doc) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(doc)
  } catch {
    return `<p>${escapeHtml(doc)}</p>`
  }
  const root = parsed as PMNode | null
  if (!root || typeof root !== 'object' || !Array.isArray(root.content)) return ''
  return root.content.map(blockHtml).join('\n')
}

/** 演示态大屏样式：放大正文排版（覆盖 wiki-editor.css 的默认字号） */
const PRESENT_STYLE = `
.present-body .wiki-editor .ProseMirror { font-size: 20px; line-height: 1.85; min-height: 0; }
.present-body .wiki-editor .ProseMirror h1 { font-size: 1.9em; }
.present-body .wiki-editor .ProseMirror h2 { font-size: 1.55em; }
.present-body .wiki-editor .ProseMirror h3 { font-size: 1.3em; }
.present-body .wiki-editor .ProseMirror pre { font-size: 16px; }
.present-body .wiki-editor .ProseMirror th, .present-body .wiki-editor .ProseMirror td { padding: 10px 14px; }
`

/* ── P2 shell 共享按钮样式（方案 §2.3/2.4：操作全部平铺，ghost 层级） ── */

/** 图标按钮（二级工具条右侧 / 编辑态子栏）：无描边、hover sunken 底 */
const iconBtnCls =
  'flex h-7 w-7 items-center justify-center rounded-ctrl text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1'
/** 二级工具条文字按钮（导出/演示/版本历史/另存为模板） */
const toolBtnCls =
  'inline-flex h-7 items-center gap-1.5 rounded-ctrl px-2.5 text-meta text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1'
/** 图标按钮激活态（目录面板展开时） */
const iconBtnActiveCls = 'bg-brand-light text-brand hover:bg-brand-light hover:text-brand'

/** 只读 JSON 树：递归渲染页面 content 的结构预览 */
function JsonTree({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-3">null</span>
  }
  if (typeof value === 'string') {
    return <span className="text-success">"{value}"</span>
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-brand">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">[]</span>
    return (
      <div className="border-l border-line pl-4">
        {value.map((v, i) => (
          <div key={i} className="py-0.5 text-[13px]">
            <span className="mr-1 text-ink-3">{i}:</span>
            <JsonTree value={v} />
          </div>
        ))}
      </div>
    )
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="text-ink-3">{'{}'}</span>
  return (
    <div className="border-l border-line pl-4">
      {entries.map(([k, v]) => (
        <div key={k} className="py-0.5 text-[13px]">
          <span className="mr-1 text-ink-2">{k}:</span>
          <JsonTree value={v} />
        </div>
      ))}
    </div>
  )
}

/** 行级 diff 渲染：红删绿增 */
function DiffRows({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-ink-3">两个版本文本内容一致</p>
  }
  return (
    <div className="max-h-72 overflow-y-auto rounded-ctrl border border-line font-mono text-xs">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-2 whitespace-pre-wrap px-2.5 py-1',
            row.type === 'add' && 'bg-success-light text-success',
            row.type === 'del' && 'bg-danger-light text-danger',
            row.type === 'same' && 'text-ink-2',
          )}
        >
          <span className="shrink-0 select-none opacity-70">
            {row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
          </span>
          <span className="min-w-0 flex-1">{row.text || ' '}</span>
        </div>
      ))}
    </div>
  )
}

/** 版本详情区块：JSON 树预览 + 与当前版本对比 + 回滚 */
function VersionDetailSection({
  nodeId,
  versionNo,
  currentContent,
  onRestore,
}: {
  nodeId: number
  versionNo: number
  currentContent: string | null
  onRestore: (versionNo: number) => void
}) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof wikiApi.getVersion>> | null>(null)
  const [error, setError] = useState('')
  const [comparing, setComparing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  // 对比结果按需计算并缓存
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setDetail(null)
    setComparing(false)
    setDiffRows(null)
    wikiApi
      .getVersion(nodeId, versionNo)
      .then((d) => {
        if (alive) setDetail(d)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '版本详情加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [nodeId, versionNo])

  const toggleCompare = () => {
    if (comparing) {
      setComparing(false)
      return
    }
    if (!diffRows) {
      setDiffRows(diffContents(detail?.content ?? null, currentContent))
    }
    setComparing(true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size={18} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-ctrl bg-warning-light px-3 py-2.5 text-meta text-warning-ink">
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
        {error}
      </div>
    )
  }
  if (!detail) return null

  const detailJson: unknown = (() => {
    if (!detail?.content) return null
    try {
      return JSON.parse(detail.content) as unknown
    } catch {
      return { 原始内容: detail.content }
    }
  })()

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-1">{detail.title || '（无标题）'}</p>
          <p className="mt-0.5 text-meta text-ink-3">
            v{detail.versionNo} · {detail.publishedByName ?? '—'} · {fmtTs(detail.publishedAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" onClick={toggleCompare}>
            <GitCompare size={13} />
            {comparing ? '收起对比' : '对比当前版本'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={restoring}
            onClick={() => {
              if (window.confirm(`确定回滚到 v${detail.versionNo} 吗？该版本内容会写入你的草稿。`)) {
                setRestoring(true)
                onRestore(detail.versionNo)
              }
            }}
          >
            <RotateCcw size={13} />
            回滚到此版本
          </Button>
        </div>
      </div>

      {comparing && (
        <div className="mb-3">
          <p className="mb-1.5 text-meta text-ink-3">
            行级对比：v{detail.versionNo} → 当前已发布版本（红=删除，绿=新增）
          </p>
          <DiffRows rows={diffRows ?? []} />
        </div>
      )}

      <p className="mb-1.5 text-meta text-ink-3">内容结构预览（只读 JSON）</p>
      <div className="max-h-64 overflow-y-auto rounded-ctrl bg-sunken p-3 font-mono text-ink-2">
        <JsonTree value={detailJson} />
      </div>
    </div>
  )
}

/** 版本历史抽屉（页面内右侧滑出） */
function VersionDrawer({
  open,
  onClose,
  nodeId,
  currentContent,
  onRestore,
}: {
  open: boolean
  onClose: () => void
  nodeId: number
  currentContent: string | null
  onRestore: (versionNo: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    let alive = true
    setLoading(true)
    setError('')
    wikiApi
      .listVersions(nodeId)
      .then((r) => {
        if (alive) setVersions(r.list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '版本列表加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, nodeId])

  if (!open) return null

  return (
    <div
      className="no-print fixed inset-0 z-[95] flex justify-end bg-ink-1/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full w-[440px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-3">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
            <History size={16} className="text-ink-3" />
            版本历史
          </h3>
          <button type="button" className="text-ink-3 hover:text-ink-2" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <Spinner size={20} />
            </div>
          )}
          {!loading && error && <DialogError message={error} />}
          {!loading && !error && versions.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-3">暂无发布版本</p>
          )}
          {versions.map((v) => (
            <div key={v.versionNo} className="border-b border-line">
              <button
                type="button"
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-sunken',
                  selected === v.versionNo && 'bg-brand-light hover:bg-brand-light',
                )}
                onClick={() => setSelected((s) => (s === v.versionNo ? null : v.versionNo))}
              >
                <span className="shrink-0 rounded bg-sunken px-1.5 py-0.5 text-xs font-medium text-ink-2">
                  v{v.versionNo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-1">{v.title || '（无标题）'}</span>
                  <span className="mt-0.5 block text-meta text-ink-3">
                    {v.publishedByName ?? '—'} · {fmtTs(v.publishedAt)}
                  </span>
                </span>
              </button>
              {selected === v.versionNo && (
                <VersionDetailSection
                  nodeId={nodeId}
                  versionNo={v.versionNo}
                  currentContent={currentContent}
                  onRestore={onRestore}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 页面阅读/编辑双态页 */
export default function PageViewPage() {
  const params = useParams()
  const nodeId = Number(params.nodeId)
  const spaceId = Number(params.spaceId)
  const location = useLocation()
  const navigate = useNavigate()

  // 模式由 URL 路径决定：…/page/:nodeId 阅读态，…/page/:nodeId/edit 编辑态
  const isEditPath = location.pathname.endsWith('/edit')
  const mode: 'read' | 'edit' = isEditPath ? 'edit' : 'read'
  const [page, setPage] = useState<PageDetail | null>(null)
  const [draft, setDraft] = useState<NodeDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  // 草稿提示条「查看已发布」后本次会话内不再打扰
  const [draftBarDismissed, setDraftBarDismissed] = useState(false)
  // 编辑态标题（与 page.title 同步；失焦/回车后写入节点并刷新树）
  const [editTitle, setEditTitle] = useState('')

  // 编辑态
  const [editInitial, setEditInitial] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [saveState, setSaveState] = useState<'editing' | 'saving' | 'saved'>('editing')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [publishing, setPublishing] = useState(false)

  // 阅读态操作
  const [fav, setFav] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplError, setTplError] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  // 演示模式：与 URL query present=1 双向同步（AppLayout 据此隐藏侧栏/顶栏）
  const [searchParams, setSearchParams] = useSearchParams()
  const presentMode = searchParams.get('present') === '1'

  // 宽窄屏偏好（工具条/子栏图标按钮切换，persist 持久化；演示模式固定 960px 不受影响）
  const wide = useEditorPrefsStore((s) => s.wide)
  const toggleWide = useEditorPrefsStore((s) => s.toggle)

  // 嵌入块预览弹窗（阅读态）：NodeView 深处经 CustomEvent 请求打开
  const [embedPreview, setEmbedPreview] = useState<EmbedPreviewDetail | null>(null)
  const closeEmbedPreview = useCallback(() => setEmbedPreview(null), [])
  useEffect(() => {
    const onOpen = (e: Event) => setEmbedPreview((e as CustomEvent<EmbedPreviewDetail>).detail)
    window.addEventListener(EMBED_PREVIEW_EVENT, onOpen)
    return () => window.removeEventListener(EMBED_PREVIEW_EVENT, onOpen)
  }, [])

  // presence 软锁：他人正在编辑时进入编辑态前先确认（记录待载入的内容）
  const [editConfirmOpen, setEditConfirmOpen] = useState(false)
  const [pendingEditContent, setPendingEditContent] = useState<string | null>(null)

  // @提及候选人：空间成员（仅空间内成员可被 @），带缓存 + 去抖
  const mentionCacheRef = useRef<{ spaceId: number; at: number; list: { id: number; label: string }[] } | null>(null)
  const mentionDebounceRef = useRef<number | null>(null)
  const searchSpaceMention = useCallback(
    (query: string) =>
      new Promise<{ id: number; label: string }[]>((resolve) => {
        if (mentionDebounceRef.current) window.clearTimeout(mentionDebounceRef.current)
        mentionDebounceRef.current = window.setTimeout(async () => {
          try {
            const cached = mentionCacheRef.current
            let list =
              cached && cached.spaceId === spaceId && Date.now() - cached.at < 60_000
                ? cached.list
                : null
            if (!list) {
              const res = await listMembers(spaceId)
              list = res.list.map((m) => ({ id: m.userId, label: m.displayName }))
              mentionCacheRef.current = { spaceId, at: Date.now(), list }
            }
            const q = query.trim().toLowerCase()
            resolve(
              q
                ? list.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8)
                : list.slice(0, 8),
            )
          } catch {
            resolve([])
          }
        }, 250)
      }),
    [spaceId],
  )

  // 导入弹窗（编辑态）：粘贴 Markdown / HTML 插入光标处
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  // 编辑器实例（导入时调用 insertContent）
  const editorRef = useRef<Editor | null>(null)
  // 工具栏用的响应式实例（onReady 时更新，触发工具栏渲染）
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  // 顶栏操作按钮挂载点（AppLayout 用户名左侧）
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setActionsSlot(document.getElementById('wiki-page-actions'))
  }, [])
  // 右上角浮动大纲卡片开关（阅读/编辑态共用，浮动目录按钮切换）
  const [tocOpen, setTocOpen] = useState(false)

  // 我在当前空间的角色（1 管理员 2 编辑者 3 查看者；null = 未知，按可编辑展示，后端兜底）
  const [myRole, setMyRole] = useState<number | null>(null)

  // 保存用的 ref（键盘快捷键/防抖回调里读最新值）
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  // 上一次成功加载的节点 id（判断是否同一节点的静默刷新）
  const lastNodeRef = useRef<number | null>(null)
  // 当前编辑会话所属节点（null=尚无会话）：区分「按钮进入编辑」与「URL 直达 /edit 待初始化」
  const editSessionNodeRef = useRef<number | null>(null)
  const draftRef = useRef<NodeDraft | null>(null)
  draftRef.current = draft
  const pageVersionNoRef = useRef<number | null>(null)
  pageVersionNoRef.current = page?.versionNo ?? null
  const editTitleRef = useRef('')
  editTitleRef.current = editTitle
  const pageTitleRef = useRef('')
  pageTitleRef.current = page?.title ?? ''
  const nodeIdRef = useRef(nodeId)
  nodeIdRef.current = nodeId
  const titleFocusedRef = useRef(false)
  const skipTitleBlurRef = useRef(false)
  const titleCommitRef = useRef<Promise<{ ok: false } | { ok: true; title: string }> | null>(null)
  const exportingPdfRef = useRef(false)

  // 可编辑：空间管理员(1)/编辑者(2)；未知(null)时先展示入口，由后端兜底；非成员(0)/查看者(3)不可编辑
  const canEdit = myRole === null || myRole === 1 || myRole === 2

  /* ── 数据加载：页面 + 草稿 并发 ── */
  useEffect(() => {
    let alive = true
    // 同一节点的再次加载（演示模式进出、重命名后回跳等）静默刷新，避免整页闪烁
    const silent = lastNodeRef.current === nodeId
    lastNodeRef.current = nodeId
    if (!silent) {
      setLoading(true)
      setDraftBarDismissed(false)
    }
    void Promise.all([
      wikiApi.getPage(nodeId).catch(() => null),
      getDraftSilent(nodeId),
    ]).then(([p, d]) => {
      if (!alive) return
      setPage(p)
      setDraft(d)
      if (p?.title != null && !titleFocusedRef.current) setEditTitle(p.title)
      // 打开成功即记录到「最近打开」（fire-and-forget）
      if (p != null) wikiApi.recordRecentOpen(nodeId)
      // 无论是否静默刷新，本轮请求完成都必须关掉 loading。
      // 否则 StrictMode/location.key 重跑时上一轮 alive=false 跳过、本轮 silent 又跳过，会一直转圈。
      setLoading(false)
      // URL 直达编辑态（刷新 / 粘贴链接 / 从全屏嵌入编辑器返回）：
      // 数据就绪后用草稿（无草稿则用已发布内容）初始化编辑会话
      if (isEditPath && editSessionNodeRef.current !== nodeId) {
        startEditSession(d?.content ?? p?.content ?? '')
      }
    })
    return () => {
      alive = false
    }
  }, [nodeId, reload, location.key])

  // 收藏状态（后端 page.favorited 缺失时兜底查收藏列表）
  useEffect(() => {
    setFav(false)
    wikiApi
      .listFavorites()
      .then((list) => setFav(list.some((f) => f.nodeId === nodeId)))
      .catch(() => {})
  }, [nodeId, reload])

  // 我在空间内的角色（后端 SpaceResult 返回 myRole；兼容旧字段 role）
  useEffect(() => {
    if (!Number.isFinite(spaceId) || spaceId <= 0) return
    wikiApi
      .listSpaces()
      .then((spaces: Space[]) => {
        const current = spaces.find((s) => s.id === spaceId)
        if (!current) {
          setMyRole(0)
          return
        }
        const withRole = current as Space & { myRole?: number }
        setMyRole(withRole.myRole ?? current.role ?? 0)
      })
      .catch(() => setMyRole(null))
  }, [spaceId, reload])

  // 无编辑权限（非成员/查看者）直接访问 /edit：重定向回阅读态（草稿保存由后端兜底拒绝）
  useEffect(() => {
    if (isEditPath && myRole !== null && !canEdit) {
      navigate(`/app/space/${spaceId}/page/${nodeId}`, { replace: true })
    }
  }, [isEditPath, myRole, canEdit, navigate, spaceId, nodeId])

  /* ── 草稿保存 ── */

  const doSave = useCallback(
    async (content: string) => {
      setSaveState('saving')
      try {
        await wikiApi.saveDraft(nodeId, {
          content,
          baseVersionId: draftRef.current?.baseVersionId ?? undefined,
        })
        setSaveState('saved')
        setSavedAt(new Date())
        dirtyRef.current = false
        // 本地同步草稿态：退出编辑后提示条能立即出现
        setDraft((d) => ({
          nodeId,
          content,
          baseVersionId: d?.baseVersionId ?? 0,
          updatedAt: new Date().toISOString(),
          currentVersionNo: d?.currentVersionNo ?? pageVersionNoRef.current ?? 0,
        }))
      } catch {
        // 保存失败（拦截器已提示）：回到编辑中状态，下次修改会重试
        setSaveState('editing')
      }
    },
    [nodeId],
  )

  /** 立即落盘：取消防抖定时器，脏内容直接保存 */
  const flushSave = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (dirtyRef.current) {
      await doSave(contentRef.current)
    }
  }, [doSave])

  /** 提交编辑态标题：空则还原；有变更则写节点并刷新侧栏树。同一次提交单飞，避免 blur 与发布并发。 */
  const commitTitle = useCallback(async (): Promise<{ ok: false } | { ok: true; title: string }> => {
    if (titleCommitRef.current) return titleCommitRef.current
    const run = (async (): Promise<{ ok: false } | { ok: true; title: string }> => {
      const committedNodeId = nodeIdRef.current
      const current = pageTitleRef.current
      const prepared = preparePageTitle(editTitleRef.current, current)
      if (!prepared.ok) {
        toast.error('请输入标题')
        setEditTitle(current)
        return { ok: false }
      }
      if (!prepared.changed) {
        setEditTitle(prepared.title)
        return { ok: true, title: prepared.title }
      }
      try {
        await wikiApi.updateNode(committedNodeId, { title: prepared.title })
        pageTitleRef.current = prepared.title
        if (nodeIdRef.current === committedNodeId) {
          setPage((p) => (p ? { ...p, title: prepared.title } : p))
          setEditTitle(prepared.title)
        }
        emitTreeChanged()
        return { ok: true, title: prepared.title }
      } catch {
        if (nodeIdRef.current === committedNodeId) setEditTitle(current)
        return { ok: false }
      }
    })()
    titleCommitRef.current = run
    try {
      return await run
    } finally {
      titleCommitRef.current = null
    }
  }, [])

  const handleEditorUpdate = useCallback(
    (json: string) => {
      contentRef.current = json
      dirtyRef.current = true
      setSaveState('editing')
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void doSave(contentRef.current)
      }, 2000)
    },
    [doSave],
  )

  // Ctrl/Cmd+S 立即保存
  useEffect(() => {
    if (mode !== 'edit') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flushSave()
        void commitTitle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, flushSave, commitTitle])

  // 卸载时清掉未触发的防抖保存
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  /* ── 模式切换（阅读 ↔ 编辑 由 URL 路径承载） ── */

  /** 初始化编辑会话内容（不改 URL）；记录会话节点，供 URL 直达 /edit 时判断是否需初始化 */
  /* ── 实时协同会话 ──
   * 编辑态创建 Y.Doc + WebSocket 连接（房间 wiki-node-<id>）；正文以 Y 文档为唯一事实源。
   * 空房间（首次协同打开/无快照）时，首个同步完成的客户端用本地草稿/已发布内容播种。 */
  const [collabSession, setCollabSession] = useState<CollabSession | null>(null)
  const collabSessionRef = useRef<CollabSession | null>(null)
  const destroyCollab = useCallback(() => {
    const cur = collabSessionRef.current
    if (cur) {
      try {
        cur.provider.destroy()
        cur.ydoc.destroy()
      } catch {
        // 已销毁则忽略
      }
    }
    collabSessionRef.current = null
    setCollabSession(null)
  }, [])

  // 换页面 / 离开编辑器时释放连接（服务端在最后一人离开后防抖落库快照）
  useEffect(() => {
    return () => destroyCollab()
  }, [nodeId, destroyCollab])

  const startEditSession = useCallback(
    (content: string | null) => {
      const c = content ?? ''
      contentRef.current = c
      dirtyRef.current = false
      setEditInitial(c)
      setEditorKey((k) => k + 1)
      setSaveState('editing')
      setSavedAt(null)
      editSessionNodeRef.current = nodeId

      // 建立协同连接（旧会话先释放）
      destroyCollab()
      try {
        const token = useAuthStore.getState().accessToken ?? ''
        const ydoc: Y.Doc = new Y.Doc()
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const provider = new HocuspocusProvider({
          url: `${wsProto}://${window.location.host}/collab`,
          name: `wiki-node-${nodeId}`,
          document: ydoc,
          token,
        })
        const palette = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1']
        const uid = useAuthStore.getState().user?.id ?? 0
        const displayName = useAuthStore.getState().user?.displayName ?? '?'
        const session: CollabSession = {
          ydoc,
          provider,
          user: { name: displayName, color: palette[uid % palette.length] },
        }
        collabSessionRef.current = session
        setCollabSession(session)
        // 调试句柄：浏览器控制台/自动化测试可检查协同连接状态
        ;(window as unknown as Record<string, unknown>).__wikiCollab = { provider, ydoc }
        // 空房间播种：同步完成时 Y 文档仍为空且本地有草稿/已发布正文 → 写入一次。
        // synced 事件可能早于编辑器实例就绪，故注册事件后再补偿重试一次（frag 非空即跳过）。
        const trySeed = () => {
          const ed = editorRef.current
          const frag = ydoc.getXmlFragment('default')
          if (ed && !ed.isDestroyed && frag.length === 0 && c) {
            try {
              const json = JSON.parse(c) as Record<string, unknown>
              if (json && (json as { type?: string }).type === 'doc') {
                ed.commands.setContent(json, false)
              }
            } catch {
              // 非法 JSON 不播种
            }
          }
        }
        provider.on('synced', trySeed)
        window.setTimeout(trySeed, 800)
      } catch {
        // 协同连接失败：编辑器退化为本地模式（草稿仍走自动保存）
        destroyCollab()
      }
    },
    [nodeId, destroyCollab],
  )

  /** 进入编辑态：初始化会话并写入 /edit 路径 */
  const enterEdit = useCallback(
    (content: string | null) => {
      startEditSession(content)
      if (!isEditPath) navigate(`/app/space/${spaceId}/page/${nodeId}/edit`)
    },
    [startEditSession, isEditPath, navigate, spaceId, nodeId],
  )

  /** 请求进入编辑态：他人正在编辑（presence 软锁）时先弹确认 */
  const requestEnterEdit = useCallback(
    (content: string | null) => {
      if ((page?.editingUsers?.length ?? 0) > 0) {
        setPendingEditContent(content)
        setEditConfirmOpen(true)
        return
      }
      enterEdit(content)
    },
    [page?.editingUsers, enterEdit],
  )

  /** 退出编辑：回阅读路径（URL 变化会触发静默刷新，无需手动 reload） */
  const exitEdit = useCallback(async () => {
    if (dirtyRef.current) {
      const ok = window.confirm('当前有未保存的修改，退出前会自动保存为草稿。确定退出编辑吗？')
      if (!ok) return
      await flushSave().catch(() => {})
    }
    const titleRes = await commitTitle()
    if (!titleRes.ok) return
    navigate(`/app/space/${spaceId}/page/${nodeId}`)
  }, [flushSave, commitTitle, navigate, spaceId, nodeId])

  const publishNow = useCallback(async () => {
    setPublishing(true)
    try {
      // 发布前先落草稿（未做任何修改则草稿与上次一致，重复保存无害）
      await flushSave()
      const titleRes = await commitTitle()
      if (!titleRes.ok) return
      const r = await wikiApi.publish(nodeId, { title: titleRes.title })
      const publishedContent = contentRef.current
      setPage((p) =>
        p
          ? applyPublishedSnapshot(p, {
              title: titleRes.title,
              content: publishedContent,
              versionNo: r.versionNo,
            })
          : p,
      )
      setDraft(null)
      setDraftBarDismissed(false)
      setReload((x) => x + 1)
      emitTreeChanged()
      toast.success(`已发布，当前版本 v${r.versionNo}`)
      navigate(`/app/space/${spaceId}/page/${nodeId}`)
    } catch {
      // 拦截器已提示
    } finally {
      setPublishing(false)
    }
  }, [flushSave, commitTitle, nodeId, navigate, spaceId])

  // 版本回滚完成：刷新草稿并进入编辑态载入
  const handleRestored = useCallback(
    async (_versionNo: number) => {
      setDrawerOpen(false)
      const d = await getDraftSilent(nodeId)
      if (d) setDraft(d)
      toast.success('已写入草稿')
      enterEdit(d?.content ?? page?.content ?? '')
    },
    [nodeId, page?.content, enterEdit],
  )

  /* ── 演示模式 ── */

  /** 复制当前页面链接（标题行右上角图标） */
  const copyPageLink = useCallback(() => {
    const url = window.location.href
    if (!navigator.clipboard?.writeText) {
      toast.error('当前环境不支持复制')
      return
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('链接已复制'))
      .catch(() => toast.error('复制失败'))
  }, [])

  /** 进入演示：请求全屏（失败静默）并同步 ?present=1 */
  const enterPresent = useCallback(() => {
    try {
      void document.documentElement.requestFullscreen()?.catch(() => {
        // 全屏被拒绝或不支持：静默降级，仅隐藏侧栏/顶栏
      })
    } catch {
      // 同上：静默降级
    }
    setSearchParams({ present: '1' })
  }, [setSearchParams])

  /** 退出演示：退出全屏并清除 query */
  const exitPresent = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    setSearchParams({})
  }, [setSearchParams])

  // 演示态：Esc 退出
  useEffect(() => {
    if (!presentMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPresent()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presentMode, exitPresent])

  // 浏览器原生退出全屏（如系统级 Esc / F11）时同步清除 present 参数
  useEffect(() => {
    if (!presentMode) return
    const onFsChange = () => {
      if (!document.fullscreenElement && new URLSearchParams(window.location.search).get('present') === '1') {
        setSearchParams({})
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [presentMode, setSearchParams])

  /* ── 阅读态操作 ── */

  /** 导出 Markdown：正文 JSON → Markdown 文件下载 */
  const exportMarkdown = () => {
    if (!page) return
    const md = jsonToMarkdown(page.content ?? '')
    downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${page.title || '未命名页面'}.md`)
    toast.success('已导出 Markdown')
  }

  /** 导出 Word：标题 + 正文 JSON 转 HTML，以 Word MIME 打包为 .doc 下载 */
  const exportWord = () => {
    if (!page) return
    const title = page.title || '未命名页面'
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      `<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>` +
      `<body><h1>${escapeHtml(title)}</h1>${jsonToHtml(page.content ?? '')}</body></html>`
    // 加 BOM 便于 Word 正确识别 UTF-8
    downloadBlob(
      new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
      `${title}.doc`,
    )
    toast.success('已导出 Word')
  }

  /** 导出 PDF：截取正文区域生成 A4 文件并下载（不再打开系统打印） */
  const exportPdf = async () => {
    if (!page || exportingPdfRef.current) return
    const el = document.querySelector('.page-pdf-root')
    if (!(el instanceof HTMLElement)) {
      toast.error('找不到可导出的页面内容')
      return
    }
    exportingPdfRef.current = true
    setExportingPdf(true)
    toast.info('正在导出 PDF…')
    try {
      const blob = await captureElementPdf(el)
      downloadBlob(blob, `${sanitizePdfBasename(page.title)}.pdf`)
      toast.success('已导出 PDF')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出 PDF 失败')
    } finally {
      exportingPdfRef.current = false
      setExportingPdf(false)
    }
  }

  const toggleFavorite = async () => {
    try {
      const r = await wikiApi.toggleFavorite(nodeId)
      setFav(r.favorited)
      toast.success(r.favorited ? '已收藏' : '已取消收藏')
    } catch {
      // 拦截器已提示
    }
  }

  const submitTemplate = async () => {
    const name = tplName.trim()
    if (!name) {
      setTplError('请输入模板名称')
      return
    }
    setTplSaving(true)
    setTplError('')
    try {
      await wikiApi.saveAsTemplate(nodeId, { title: name })
      toast.success('已另存为模板')
      setTplOpen(false)
    } catch (err) {
      setTplError(err instanceof Error ? err.message : '另存为模板失败')
    } finally {
      setTplSaving(false)
    }
  }

  const discardDraft = async () => {
    try {
      await wikiApi.deleteDraft(nodeId)
      toast.success('已放弃未发布的修改')
      setDraft(null)
      setDraftBarDismissed(false)
      setDiscardOpen(false)
      setReload((x) => x + 1)
    } catch {
      // 拦截器已提示
    }
  }

  /* ── 编辑态：导入 ── */

  /** WikiEditor 就绪回调：保存实例供导入与工具栏使用 */
  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    setActiveEditor(editor)
  }, [])

  /** 导入提交：以 < 开头按 HTML 处理，否则按 Markdown 处理，统一插入光标处 */
  const submitImport = async () => {
    const text = importText.trim()
    if (!text) {
      setImportError('请粘贴要导入的内容')
      return
    }
    const editor = editorRef.current
    if (!editor) {
      setImportError('编辑器尚未就绪，请稍后重试')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      if (text.startsWith('<')) {
        // HTML：直接交给 Tiptap 解析并插入
        editor.commands.insertContent(text)
      } else {
        // Markdown：先转 ProseMirror JSON 再插入
        editor.commands.insertContent(JSON.parse(markdownToJson(text)) as JSONContent)
      }
      toast.success('内容已插入到光标处')
      setImportOpen(false)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败，请检查内容格式')
    } finally {
      setImporting(false)
    }
  }

  /* ── 渲染 ── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-ink-3">
        <p className="text-sm">页面不存在或已被删除</p>
        <Link to="/app" className="text-sm text-brand hover:underline">
          返回主页
        </Link>
      </div>
    )
  }

  // 演示态：纯正文大屏（侧栏/顶栏由 AppLayout 按 ?present=1 隐藏），右上角仅保留退出按钮
  if (presentMode && mode === 'read') {
    return (
      <div className="relative min-h-screen bg-surface">
        <style>{PRESENT_STYLE}</style>
        <button
          type="button"
          className="fixed right-6 top-6 z-10 flex items-center gap-1.5 rounded-ctrl border border-line bg-surface/90 px-3 py-1.5 text-sm text-ink-2 shadow-1 backdrop-blur transition-colors hover:text-brand"
          onClick={exitPresent}
        >
          <Minimize2 size={15} />
          退出演示
        </button>
        <div className="present-body mx-auto max-w-[1080px] px-10 py-16">
          <h1 className="mb-10 text-4xl font-bold leading-tight text-ink-1">{page.title}</h1>
          {page.content ? (
            <WikiEditor key={`present-${reload}`} initialContent={page.content} editable={false} />
          ) : (
            <p className="py-24 text-center text-base text-ink-3">暂无内容</p>
          )}
        </div>
      </div>
    )
  }

  // 编辑态：顶部工具条（保存状态 / 发布 / 退出编辑）+ 编辑器
  if (mode === 'edit') {
    const saveText =
      saveState === 'saving'
        ? '保存中…'
        : saveState === 'saved' && savedAt
          ? `已保存 ${savedAt.toTimeString().slice(0, 5)}`
          : '编辑中'
    return (
      <>
        {/* 编辑态全幅白画布（方案 §2.4）：子栏 + 与阅读页同宽同轴的编辑器 */}
        <div className="flex h-full min-h-full flex-col bg-surface">
          {/* 子栏：标题 + 状态 chip 跟随（修复被浮动按钮遮挡的缺陷）+ 草稿基线 + 目录/宽窄 */}
          <div className="no-print flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
            <span className="min-w-0 max-w-[40%] truncate text-base font-semibold text-ink-1">
              {editTitle || '未命名页面'}
            </span>
            <span
              className={cn(
                'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium',
                saveState === 'saved' ? 'bg-success-light text-success' : 'bg-sunken text-ink-3',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  saveState === 'saved' ? 'bg-success' : 'bg-ink-3',
                )}
              />
              {saveText}
            </span>
            <span className="flex-1" />
            {(draft?.currentVersionNo ?? 0) > 0 && (
              <span className="shrink-0 text-meta text-ink-3">
                草稿基于 v{draft?.currentVersionNo}
              </span>
            )}
            <button
              type="button"
              title="目录"
              className={cn(iconBtnCls, tocOpen && iconBtnActiveCls)}
              onClick={() => setTocOpen((o) => !o)}
            >
              <ListTree size={16} />
            </button>
            <button
              type="button"
              title={wide ? '切换窄屏' : '切换宽屏'}
              className={iconBtnCls}
              onClick={toggleWide}
            >
              {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* 画布：窄屏与阅读页同文本栏宽（720px 文本，px-12 同时留出块徽标槽 -38px）/ 宽屏 100% */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={cn(
                'mx-auto w-full min-w-0 px-12 pb-[200px] pt-9',
                wide ? 'max-w-none' : 'max-w-[928px]',
              )}
            >
              <h1 className="m-0">
                <input
                  aria-label="页面标题"
                  className="w-full border-0 bg-transparent text-title font-semibold text-ink-1 outline-none placeholder:font-medium placeholder:text-ink-3"
                  value={editTitle}
                  placeholder="未命名页面"
                  maxLength={256}
                  onFocus={() => {
                    titleFocusedRef.current = true
                  }}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    if (skipTitleBlurRef.current) {
                      skipTitleBlurRef.current = false
                      titleFocusedRef.current = false
                      return
                    }
                    void commitTitle().finally(() => {
                      titleFocusedRef.current = false
                    })
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      skipTitleBlurRef.current = true
                      const revert = pageTitleRef.current
                      editTitleRef.current = revert
                      setEditTitle(revert)
                      e.currentTarget.blur()
                    }
                  }}
                />
              </h1>
              <div className="mt-4 min-h-[460px]">
                <WikiEditor
                  key={`edit-${editorKey}`}
                  initialContent={editInitial}
                  editable
                  onUpdate={handleEditorUpdate}
                  onReady={handleEditorReady}
                  mentionProvider={searchSpaceMention}
                  collab={collabSession}
                  placeholder="输入 “/” 唤出插入菜单，或直接开始书写…"
                />
              </div>
            </div>
          </div>
        </div>
        {/* 编辑操作按钮：portal 到顶栏右侧（用户名左侧） */}
        {actionsSlot &&
          createPortal(
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  setImportText('')
                  setImportError('')
                  setImportOpen(true)
                }}
              >
                <Import size={14} />
                导入
              </Button>
              <Button size="sm" onClick={() => void exitEdit()}>
                <LogOut size={14} />
                退出编辑
              </Button>
              <Button size="sm" variant="primary" loading={publishing} onClick={() => void publishNow()}>
                <Upload size={14} />
                发布
              </Button>
            </div>,
            actionsSlot,
          )}
        {/* 浮动大纲卡片（子栏「目录」按钮切换） */}
        {tocOpen && (
          <TocPanel editor={activeEditor} contentJson={editInitial} onCollapse={() => setTocOpen(false)} />
        )}

        {/* 导入内容弹窗：粘贴 Markdown / HTML，自动识别后插入光标处 */}
        <Dialog
          open={importOpen}
          title="导入内容"
          width={480}
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <Button onClick={() => setImportOpen(false)}>取消</Button>
              <Button variant="primary" loading={importing} onClick={() => void submitImport()}>
                导入
              </Button>
            </>
          }
        >
          <DialogError message={importError} />
          <Textarea
            rows={8}
            label="内容"
            placeholder="粘贴 Markdown 或 HTML 内容…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            <input type="radio" name="import-mode" checked onChange={() => {}} />
            自动识别（以 &lt; 开头按 HTML 处理，否则按 Markdown 处理）
          </label>
        </Dialog>
      </>
    )
  }

  // 阅读态
  const hasDraft = Boolean(draft?.content)
  const showDraftBar = hasDraft && !draftBarDismissed
  const editingUsers = page.editingUsers ?? []

  return (
    // 阅读态全幅白画布（方案 §2.3）：窄屏 768px 阅读栏 / 宽屏 100%；
    // 操作全部平铺进页面内二级工具条（无溢出菜单、不再 portal 到顶栏）
    <div className="relative min-h-full bg-surface">
      <div
        className={cn(
          'page-print-area mx-auto w-full min-w-0 pb-12 pt-8',
          wide ? 'max-w-none px-12' : 'max-w-[880px] px-6',
        )}
      >
      {/* 标题与操作 */}
      <div className="page-pdf-root w-full min-w-0">
      {/* 标题行：标题居左 + 右侧收藏/链接/编辑 */}
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 break-words text-title font-semibold text-ink-1">
          {page.title}
        </h1>
        <div className="no-print flex shrink-0 items-center gap-1 pt-1">
          <button
            type="button"
            title={fav ? '取消收藏' : '收藏'}
            className={cn(iconBtnCls, fav && 'text-warning hover:text-warning')}
            onClick={() => void toggleFavorite()}
          >
            <Star size={16} className={fav ? 'fill-warning' : ''} />
          </button>
          <button
            type="button"
            title="复制链接"
            className={iconBtnCls}
            onClick={copyPageLink}
          >
            <Link2 size={16} />
          </button>
          {canEdit && (
            <Button
              size="sm"
              variant="primary"
              className="ml-1.5"
              onClick={() => requestEnterEdit(draft?.content ?? page.content)}
            >
              <Pencil size={14} />
              编辑
            </Button>
          )}
        </div>
      </div>

      {/* meta 信息行：版本 / 浏览 / 发布人 / 发布时间 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-meta text-ink-3">
        <span>版本 {page.versionNo != null ? `v${page.versionNo}` : '未发布'}</span>
        <span className="flex items-center gap-1">
          <Eye size={13} />
          浏览 {page.viewCount}
        </span>
        <span>发布人 {page.publishedByName ?? '—'}</span>
        {page.publishedAt && <span>{fmtTs(page.publishedAt)}</span>}
      </div>

      {/* 二级工具条：导出 / 演示 / 版本历史 / 另存为模板 + 右侧目录 / 宽窄 / 全屏 */}
      <div className="no-print mt-4 flex items-center gap-0.5 border-b border-line py-1">
        <Dropdown
          align="left"
          trigger={
            <button type="button" className={toolBtnCls}>
              <Download size={15} />
              导出
              <ChevronDown size={13} className="text-ink-3" />
            </button>
          }
        >
          <DropdownItem icon={<FileText size={14} />} onClick={exportMarkdown}>
            导出 Markdown
          </DropdownItem>
          <DropdownItem icon={<FileDown size={14} />} onClick={exportWord}>
            导出 Word
          </DropdownItem>
          <DropdownItem icon={<FileDown size={14} />} onClick={() => void exportPdf()} disabled={exportingPdf}>
            {exportingPdf ? '正在导出…' : '导出 PDF'}
          </DropdownItem>
        </Dropdown>
        <button type="button" className={toolBtnCls} onClick={enterPresent}>
          <Maximize2 size={15} />
          演示
        </button>
        <button type="button" className={toolBtnCls} onClick={() => setDrawerOpen(true)}>
          <History size={15} />
          版本历史
        </button>
        <button
          type="button"
          className={toolBtnCls}
          onClick={() => {
            setTplName(page.title)
            setTplError('')
            setTplOpen(true)
          }}
        >
          另存为模板
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="目录"
            className={cn(iconBtnCls, tocOpen && iconBtnActiveCls)}
            onClick={() => setTocOpen((o) => !o)}
          >
            <ListTree size={16} />
          </button>
          <button
            type="button"
            title={wide ? '切换窄屏' : '切换宽屏'}
            className={iconBtnCls}
            onClick={toggleWide}
          >
            {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button type="button" title="全屏阅读" className={iconBtnCls} onClick={enterPresent}>
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* presence 软锁提示：他人正在编辑本页（细条样式，方案 §2.3） */}
      {editingUsers.length > 0 && (
        <div className="no-print mt-4 flex flex-wrap items-center gap-2 rounded-ctrl border border-warning/25 bg-warning-light px-3 py-1.5 text-meta text-warning-ink">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          <span className="min-w-0 flex-1">{editingUsers.join('、')} 正在编辑本页，发布前请注意沟通</span>
        </div>
      )}

      {/* 草稿提示条（细条样式，操作为文字链接） */}
      {showDraftBar && (
        <div className="no-print mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ctrl border border-warning/25 bg-warning-light px-3 py-1.5 text-meta text-warning-ink">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          <span className="min-w-0 flex-1">
            有未发布的修改（基于 v{draft?.currentVersionNo ?? '—'}）
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <button
              type="button"
              className="font-medium text-warning transition-colors hover:underline"
              onClick={() => requestEnterEdit(draft?.content ?? null)}
            >
              继续编辑 →
            </button>
            <button
              type="button"
              className="font-medium transition-colors hover:underline"
              onClick={() => setDraftBarDismissed(true)}
            >
              查看已发布
            </button>
            <button
              type="button"
              className="font-medium text-danger transition-colors hover:underline"
              onClick={() => setDiscardOpen(true)}
            >
              放弃修改
            </button>
          </div>
        </div>
      )}

      {/* 正文 */}
      <div className="mt-6">
        {page.content ? (
          <WikiEditor key={`read-${reload}`} initialContent={page.content} editable={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line bg-sunken/60 px-6 py-12 text-ink-3">
            <p className="text-sm">暂无已发布内容</p>
            {canEdit && <p className="text-xs">点击标题右侧「编辑」开始书写并发布第一个版本</p>}
          </div>
        )}
      </div>
      </div>

      {/* 评论区（演示/打印时不显示） */}
      <div className="no-print">
        <CommentPanel nodeId={nodeId} spaceId={spaceId} />
      </div>

      {/* 嵌入块预览弹窗（阅读态；NodeView 经 CustomEvent 请求打开） */}
      <EmbedPreviewModal info={embedPreview} onClose={closeEmbedPreview} />

      {/* 版本历史抽屉 */}
      <VersionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        nodeId={nodeId}
        currentContent={page.content}
        onRestore={(no) => void handleRestored(no)}
      />

      {/* 另存为模板弹窗 */}
      <Dialog
        open={tplOpen}
        title="另存为模板"
        onClose={() => setTplOpen(false)}
        footer={
          <>
            <Button onClick={() => setTplOpen(false)}>取消</Button>
            <Button variant="primary" loading={tplSaving} onClick={() => void submitTemplate()}>
              保存模板
            </Button>
          </>
        }
      >
        <DialogError message={tplError} />
        <Input
          label="模板名称"
          value={tplName}
          placeholder="输入模板名称"
          onChange={(e) => setTplName(e.target.value)}
        />
      </Dialog>

      {/* 放弃未发布修改确认 */}
      <ConfirmDialog
        open={discardOpen}
        title="放弃未发布的修改"
        content="将删除当前页面的草稿，此操作不可恢复。确定放弃吗？"
        confirmText="放弃修改"
        danger
        onClose={() => setDiscardOpen(false)}
        onConfirm={discardDraft}
      />

      {/* presence 软锁确认：他人正在编辑仍要进入编辑态 */}
      <ConfirmDialog
        open={editConfirmOpen}
        title="进入编辑"
        content={
          <>
            其他人正在编辑，仍要继续吗？
            {editingUsers.length > 0 && (
              <span className="mt-1 block text-xs text-ink-3">
                正在编辑：{editingUsers.join('、')}
              </span>
            )}
          </>
        }
        confirmText="继续编辑"
        onClose={() => setEditConfirmOpen(false)}
        onConfirm={async () => {
          setEditConfirmOpen(false)
          enterEdit(pendingEditContent)
        }}
      />

      </div>
      {/* 右上角浮动大纲卡片（浮动目录按钮切换） */}
      {tocOpen && <TocPanel editor={null} contentJson={page.content} onCollapse={() => setTocOpen(false)} />}
    </div>
  )
}
