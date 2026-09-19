/**
 * 子页面引用块：Tiptap 节点 `pageRef`（block 级原子节点）+ React NodeView。
 * - 卡片展示「页面图标 + 标题」，点击跳转对应页面（阅读/编辑态均可）
 * - title 是插入时的快照；渲染时经共享的页面树缓存解析最新标题，页面改名后自动跟随
 * - 页面选择器（PagePickerDialog）在 SlashMenu 侧弹出，本文件只负责节点与展示
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getTree } from '../../api/wiki'
import type { TreeData, TreeNode } from '../../api/types'

/* ---------- 共享页面树缓存：多个 pageRef 卡片复用一次拉取 ---------- */

const treeCache = new Map<number, Promise<TreeData>>()

function fetchTreeCached(spaceId: number): Promise<TreeData> {
  let p = treeCache.get(spaceId)
  if (!p) {
    p = getTree(spaceId).catch((err) => {
      treeCache.delete(spaceId) // 失败不缓存，下次重试
      throw err
    })
    treeCache.set(spaceId, p)
  }
  return p
}

/** 通知各处：页面树可能已变化（页面创建/改名/删除后调用），下次解析重新拉取 */
export function invalidatePageRefTreeCache(spaceId?: number): void {
  if (spaceId === undefined) treeCache.clear()
  else treeCache.delete(spaceId)
}

/** 在树里递归找节点标题；找不到返回 null */
function findTitle(nodes: TreeNode[], id: number): string | null {
  for (const n of nodes) {
    if (n.id === id) return n.title
    const hit = findTitle(n.children ?? [], id)
    if (hit !== null) return hit
  }
  return null
}

/* ---------- NodeView ---------- */

function PageRefNodeView({ node }: NodeViewProps) {
  const { nodeId, title } = node.attrs as { nodeId: number; title: string }
  const params = useParams()
  const spaceId = params.spaceId
  const navigate = useNavigate()
  const [resolved, setResolved] = useState<string | null>(null)

  // 快照标题兜底，树可达时用最新标题（页面改名后卡片自动跟随）
  useEffect(() => {
    let alive = true
    if (!spaceId) return
    fetchTreeCached(Number(spaceId))
      .then((tree) => {
        const t = findTitle(tree.nodes ?? [], nodeId)
        if (alive) setResolved(t)
      })
      .catch(() => {
        // 树拉取失败保持快照标题
      })
    return () => {
      alive = false
    }
  }, [spaceId, nodeId])

  const open = () => {
    if (!spaceId) return
    navigate(`/app/space/${spaceId}/page/${nodeId}`)
  }

  return (
    <NodeViewWrapper className="wiki-page-ref my-2">
      <div
        className="flex max-w-md cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40"
        onClick={open}
        title="打开页面"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-500">
          <FileText size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-blue-700 underline decoration-blue-200 underline-offset-2">
          {resolved || title || '未命名页面'}
        </span>
      </div>
    </NodeViewWrapper>
  )
}

export const PageRef = Node.create({
  name: 'pageRef',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      nodeId: {
        default: null,
        parseHTML: (element) => {
          const n = Number(element.getAttribute('data-page-id'))
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attributes) => ({ 'data-page-id': String(attributes.nodeId ?? '') }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-page-title'),
        renderHTML: (attributes) => ({ 'data-page-title': attributes.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-page-ref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-page-ref': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageRefNodeView)
  },

  addCommands() {
    return {
      insertPageRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageRefBlock: {
      /** 插入子页面引用卡片（title 为插入时快照，渲染时会自动解析最新标题） */
      insertPageRef: (attrs: { nodeId: number; title: string }) => ReturnType
    }
  }
}
