import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { TreeNode } from '../api/types'
import { cn } from '../lib/utils'

/** 节点标题：截断时悬停显示完整标题（检测溢出才挂 title，未截断不弹提示） */
function TitleWithTip({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [tipped, setTipped] = useState(false)
  return (
    <span
      ref={ref}
      className="min-w-0 flex-1 truncate"
      onMouseEnter={() => {
        const el = ref.current
        setTipped(Boolean(el && el.scrollWidth > el.clientWidth))
      }}
      onMouseLeave={() => setTipped(false)}
      title={tipped ? title : undefined}
    >
      {title}
    </span>
  )
}

interface TreeProps {
  nodes: TreeNode[]
  /** 当前选中的节点 id */
  currentNodeId?: number | null
  /** 已展开的节点 id 集合 */
  expandedIds: Set<number>
  /** 展开 / 收起切换 */
  onToggle: (id: number) => void
  /** 点击节点行 */
  onSelect: (node: TreeNode) => void
  /** 行 hover 时渲染的行内操作（新增子页 / 更多） */
  renderActions?: (node: TreeNode) => ReactNode
  /** 递归层级（内部使用） */
  depth?: number
}

/** 递归页面树：基于后端整树数据渲染，支持展开/收起、当前高亮、行内操作 */
export function Tree({
  nodes,
  currentNodeId,
  expandedIds,
  onToggle,
  onSelect,
  renderActions,
  depth = 0,
}: TreeProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const active = currentNodeId === node.id
        return (
          <li key={node.id}>
            <div
              className={cn(
                'group relative flex cursor-pointer select-none items-center gap-1 rounded-ctrl py-1.5 pr-1 text-sm',
                active
                  ? 'bg-brand-light font-medium text-brand'
                  : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
              )}
              style={{ paddingLeft: depth * 14 + 6 }}
              onClick={() => onSelect(node)}
            >
              <button
                type="button"
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:text-ink-1',
                  hasChildren ? 'text-ink-3' : 'invisible',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  if (hasChildren) onToggle(node.id)
                }}
              >
                <ChevronRight
                  size={12}
                  className={cn('transition-transform', expandedIds.has(node.id) && 'rotate-90')}
                />
              </button>
              {hasChildren ? (
                expandedIds.has(node.id) ? (
                  <FolderOpen size={14} className="shrink-0 text-ink-3" />
                ) : (
                  <Folder size={14} className="shrink-0 text-ink-3" />
                )
              ) : (
                <FileText
                  size={14}
                  className={cn('shrink-0', active ? 'text-brand' : 'text-ink-3')}
                />
              )}
              <TitleWithTip title={node.title} />
              <span
                className="hidden shrink-0 items-center gap-0.5 group-hover:flex"
                onClick={(e) => e.stopPropagation()}
              >
                {renderActions?.(node)}
              </span>
            </div>
            {hasChildren && expandedIds.has(node.id) && (
              <Tree
                nodes={node.children}
                currentNodeId={currentNodeId}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onSelect={onSelect}
                renderActions={renderActions}
                depth={depth + 1}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
