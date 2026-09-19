/**
 * 嵌入块大号预览弹窗（阅读态五种类型共用）。
 * 形态：居中大弹窗（86vw × 82vh，白底圆角阴影）；标题栏=类型图标 + 「类型 · 名称」+ 关闭；
 * 正文=嵌入内容只读渲染（复用 EmbedPreview 的封闭存储 + 隐藏 chrome + 禁交互管线）；
 * 底栏右侧「全屏编辑」跳现有全屏编辑器路由（查看者被后端 406 拦截，可接受）。
 * 打开时锁 body 滚动；Esc / 点遮罩 / 关闭按钮关闭；关闭即彻底卸载编辑器实例
 * （队列、键盘守卫、包样式经 EmbedPreviewBody 现有清理机制释放），并广播
 * `wiki:embed-preview-closed` 让同类型内联预览恢复渲染。
 */
import { X } from 'lucide-react'
import { PencilLine } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EMBED_TYPE_META } from './EmbedCardView'
import {
  EMBED_PREVIEW_CLOSED_EVENT,
  EmbedPreviewBody,
  type EmbedPreviewDetail,
} from './EmbedPreview'

interface EmbedPreviewModalProps {
  /** 当前预览信息；null=关闭 */
  info: EmbedPreviewDetail | null
  onClose: () => void
}

/** 嵌入块预览弹窗 */
export default function EmbedPreviewModal({ info, onClose }: EmbedPreviewModalProps) {
  const navigate = useNavigate()
  const params = useParams()
  const spaceId = params.spaceId
  const pageNodeId = params.nodeId

  const isOpen = info !== null

  // Esc 关闭 + body 滚动锁；卸载时恢复滚动并广播关闭事件（恢复被抑制的同类型内联预览）
  useEffect(() => {
    if (!isOpen || !info) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      window.dispatchEvent(new CustomEvent<EmbedPreviewDetail>(EMBED_PREVIEW_CLOSED_EVENT, { detail: info }))
    }
  }, [isOpen, info, onClose])

  if (!info) return null

  const meta = EMBED_TYPE_META[info.type]
  if (!meta) return null
  const Icon = meta.icon

  /** 全屏编辑：跳现有全屏编辑器路由（阅读态查看者点击会被后端 406 拦截，可接受） */
  const openFullEditor = () => {
    if (!spaceId || !pageNodeId) return
    navigate(`/app/space/${spaceId}/page/${pageNodeId}/embed/${info.embedId}?type=${info.type}`)
  }

  return (
    <div
      className="no-print fixed inset-0 z-[92] flex items-center justify-center bg-slate-900/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[82vh] w-[86vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* 标题栏：类型图标 + 「类型 · 名称」+ 关闭 */}
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-slate-100 px-4">
          <Icon size={17} className="shrink-0 text-slate-400" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {meta.label} · {info.title || '未命名嵌入'}
          </h2>
          <button
            type="button"
            title="关闭预览"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        {/* 正文：嵌入内容只读渲染（空文档显示占位） */}
        <div className="min-h-0 flex-1 bg-slate-50 p-3">
          <EmbedPreviewBody
            type={info.type}
            nodeId={info.nodeId}
            embedId={info.embedId}
            modal
            hostClassName="h-full w-full overflow-hidden rounded-lg border border-slate-200"
            renderEmpty={() => (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white text-slate-400">
                <Icon size={30} className="text-slate-300" />
                <p className="text-sm">暂无内容，点击全屏编辑开始创作</p>
              </div>
            )}
            fallback={
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white text-slate-400">
                <p className="text-sm">预览加载失败，请尝试「全屏编辑」查看</p>
              </div>
            }
          />
        </div>

        {/* 底栏：右侧「全屏编辑」 */}
        <footer className="flex h-12 shrink-0 items-center justify-end border-t border-slate-100 px-4">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
            onClick={openFullEditor}
          >
            <PencilLine size={13} />
            全屏编辑
          </button>
        </footer>
      </div>
    </div>
  )
}
