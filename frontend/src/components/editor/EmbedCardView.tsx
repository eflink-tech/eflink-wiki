/**
 * 嵌入块卡片：Tiptap 节点 `embedCard`（block 级、原子节点）+ React NodeView。
 * 编辑态：紧凑卡片（类型图标 + 标题 + 类型徽标 + 「打开编辑」跳全屏 + hover 删除）。
 * 阅读态：五种类型的「打开编辑」均改为「预览」（弹出大号预览弹窗，经 window CustomEvent
 * 通知 PageView 渲染 EmbedPreviewModal）；双击卡片同样弹出；draw / mindmap 额外渲染
 * 内联只读画布（同类型弹窗打开期间抑制渲染，因包内全局 store 为单例）。
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import {
  Eye,
  FileSpreadsheet,
  FileText,
  Network,
  PencilLine,
  Presentation,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { EmbedType } from '../../services/embedStorage'
import EmbedPreview, {
  EMBED_PREVIEW_CLOSED_EVENT,
  EMBED_PREVIEW_EVENT,
  requestEmbedPreview,
} from './EmbedPreview'

/** 嵌入类型元信息：展示名 / 图标 / 徽标配色（SlashMenu 与 NodeView 共用） */
export const EMBED_TYPE_META: Record<EmbedType, { label: string; icon: LucideIcon; badge: string }> = {
  word: { label: '文档', icon: FileText, badge: 'bg-blue-50 text-blue-600' },
  excel: { label: '表格', icon: FileSpreadsheet, badge: 'bg-emerald-50 text-emerald-600' },
  pptx: { label: '演示', icon: Presentation, badge: 'bg-orange-50 text-orange-600' },
  draw: { label: '流程图', icon: Workflow, badge: 'bg-violet-50 text-violet-600' },
  mindmap: { label: '思维导图', icon: Network, badge: 'bg-pink-50 text-pink-600' },
}

/** 未知类型兜底展示 */
const FALLBACK_META = { label: '嵌入', icon: FileText, badge: 'bg-slate-100 text-slate-500' }

/** 紧凑卡片主体（阅读/编辑共用；两组按钮按形态切换） */
function EmbedCardCompact({
  meta,
  title,
  onOpenEditor,
  onPreview,
  onDelete,
}: {
  meta: { label: string; icon: LucideIcon; badge: string }
  title: string
  /** 编辑态：打开全屏编辑器 */
  onOpenEditor: () => void
  /** 阅读态：弹出预览弹窗 */
  onPreview: () => void
  onDelete?: () => void
}) {
  const Icon = meta.icon
  const editable = Boolean(onDelete)
  return (
    <div
      className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-300"
      // 阅读态双击卡片 → 预览弹窗（编辑态双击不响应，避免打断编辑流）
      onDoubleClick={editable ? undefined : onPreview}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{title || '未命名嵌入'}</p>
        <span
          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] leading-none ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {editable ? (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
            onClick={onOpenEditor}
            contentEditable={false}
          >
            <PencilLine size={13} />
            打开编辑
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
            onClick={onPreview}
            contentEditable={false}
          >
            <Eye size={13} />
            预览
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            title="删除嵌入块"
            className="flex items-center rounded-md border border-transparent p-1.5 text-slate-300 opacity-0 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            onClick={onDelete}
            contentEditable={false}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

/** NodeView 卡片主体 */
function EmbedCardNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const { embedId, embedType, title } = node.attrs as {
    embedId: string
    embedType: EmbedType
    title: string
  }
  const meta = EMBED_TYPE_META[embedType] ?? FALLBACK_META
  const params = useParams()
  const navigate = useNavigate()
  const spaceId = params.spaceId
  const nodeId = params.nodeId

  // 订阅 editable：编辑态显示删除按钮；阅读态 draw/mindmap 切换为内联只读画布
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  })

  // 同类型预览弹窗打开期间抑制内联画布：包内全局 store 为单例，两个实例会互相覆盖文档
  const [suppressed, setSuppressed] = useState(false)
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ type: EmbedType }>).detail?.type === embedType) setSuppressed(true)
    }
    const onClosed = (e: Event) => {
      if ((e as CustomEvent<{ type: EmbedType }>).detail?.type === embedType) setSuppressed(false)
    }
    window.addEventListener(EMBED_PREVIEW_EVENT, onOpen)
    window.addEventListener(EMBED_PREVIEW_CLOSED_EVENT, onClosed)
    return () => {
      window.removeEventListener(EMBED_PREVIEW_EVENT, onOpen)
      window.removeEventListener(EMBED_PREVIEW_CLOSED_EVENT, onClosed)
    }
  }, [embedType])

  const openEditor = () => {
    if (!spaceId || !nodeId) return
    // 返回目标为页面的 /edit 路径：从全屏返回后直接回到编辑态
    navigate(`/app/space/${spaceId}/page/${nodeId}/embed/${embedId}?type=${embedType}`)
  }

  /** 请求打开预览弹窗（PageView 监听后渲染 EmbedPreviewModal） */
  const requestPreview = () => {
    if (!nodeId) return
    requestEmbedPreview({ type: embedType, nodeId: Number(nodeId), embedId, title })
  }

  const compact = (
    <EmbedCardCompact
      meta={meta}
      title={title}
      onOpenEditor={openEditor}
      onPreview={requestPreview}
      onDelete={isEditable ? () => deleteNode() : undefined}
    />
  )

  // draw / mindmap 支持内联预览（阅读/编辑态都渲染，禁交互只读；不可用时回落紧凑卡片）
  const canInlinePreview =
    (embedType === 'draw' || embedType === 'mindmap') &&
    !suppressed &&
    !!spaceId &&
    !!nodeId

  return (
    <NodeViewWrapper className="wiki-embed-card my-3">
      {canInlinePreview ? (
        <EmbedPreview
          type={embedType}
          nodeId={Number(nodeId)}
          embedId={embedId}
          title={title}
          onPreview={requestPreview}
          editable={isEditable}
          onOpenEditor={openEditor}
          renderEmpty={() => (
            <div className="flex h-[clamp(200px,30vh,280px)] flex-col items-center justify-center gap-2 bg-slate-50/60 text-slate-400">
              <p className="text-sm">暂无内容</p>
              <p className="text-xs">点击右上角「{isEditable ? '打开编辑' : '预览'}」开始创作</p>
            </div>
          )}
          fallback={compact}
        />
      ) : (
        compact
      )}
    </NodeViewWrapper>
  )
}

/** embedCard 节点：block 级原子节点，attrs 落 ProseMirror JSON 并以 data-* 序列化 */
export const EmbedCard = Node.create({
  name: 'embedCard',
  group: 'block',
  inline: false,
  // 原子节点：不接收内容，整体选中/删除
  atom: true,

  addAttributes() {
    return {
      embedId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-embed-id'),
        renderHTML: (attributes) => ({ 'data-embed-id': attributes.embedId }),
      },
      embedType: {
        default: 'word',
        parseHTML: (element) => element.getAttribute('data-embed-type'),
        renderHTML: (attributes) => ({ 'data-embed-type': attributes.embedType }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-embed-title'),
        renderHTML: (attributes) => ({ 'data-embed-title': attributes.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-card]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-embed-card': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedCardNodeView)
  },

  addCommands() {
    return {
      insertEmbedCard:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

// 命令类型声明（insertEmbedCard）
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embedCard: {
      /** 插入嵌入块卡片（embedId 由调用方生成并保证唯一） */
      insertEmbedCard: (attrs: { embedId: string; embedType: EmbedType; title: string }) => ReturnType
    }
  }
}
