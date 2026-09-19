/**
 * 页面选择器弹窗：为「子页面引用」挑选目标页面。
 * - 「搜索」页签：调 wiki 全局搜索（300ms 防抖），展示标题 + 所属空间
 * - 「页面树」页签：拉取当前空间整棵树，层级缩进展示，默认展开前两级
 * 选中后回调 onPick({ nodeId, title }) 供插入 pageRef 卡片。
 */
import { FileText, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getTree, search } from '../../api/wiki'
import type { SearchResultItem, TreeNode } from '../../api/types'
import { cn } from '../../lib/utils'
import { Dialog, DialogError } from '../Dialog'
import { Input } from '../Input'

export interface PickedPage {
  nodeId: number
  title: string
}

interface PagePickerDialogProps {
  open: boolean
  /** 当前空间 id（「页面树」页签数据源） */
  spaceId: number | undefined
  /** 需要排除的节点（一般是当前页自己） */
  excludeNodeId?: number
  onClose: () => void
  onPick: (page: PickedPage) => void
}

/* ---------- 页面树节点（递归） ---------- */

function TreeItem({
  node,
  depth,
  excludeNodeId,
  defaultOpen,
  onPick,
}: {
  node: TreeNode
  depth: number
  excludeNodeId?: number
  defaultOpen: boolean
  onPick: (page: PickedPage) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = node.children.length > 0
  const excluded = node.id === excludeNodeId
  return (
    <div>
      <div
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100',
          excluded && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          if (!excluded) onPick({ nodeId: node.id, title: node.title })
        }}
      >
        <button
          type="button"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200',
            !hasChildren && 'invisible',
          )}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={cn('transition-transform', open && 'rotate-90')}
          >
            <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <FileText size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate">{node.title || '未命名页面'}</span>
      </div>
      {open &&
        hasChildren &&
        node.children.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            excludeNodeId={excludeNodeId}
            defaultOpen={defaultOpen}
            onPick={onPick}
          />
        ))}
    </div>
  )
}

export default function PagePickerDialog({
  open,
  spaceId,
  excludeNodeId,
  onClose,
  onPick,
}: PagePickerDialogProps) {
  const [tab, setTab] = useState<'search' | 'tree'>('search')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [treeError, setTreeError] = useState('')
  const debounceRef = useRef<number | null>(null)

  // 打开时重置
  useEffect(() => {
    if (open) {
      setTab('search')
      setKeyword('')
      setResults([])
      setSearchError('')
      setTree(null)
      setTreeError('')
    }
  }, [open])

  // 搜索防抖
  useEffect(() => {
    if (!open || tab !== 'search') return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setSearching(false)
      setSearchError('')
      return
    }
    setSearching(true)
    debounceRef.current = window.setTimeout(() => {
      search(kw)
        .then((list) => {
          setResults(list.filter((r) => r.nodeId !== excludeNodeId))
          setSearchError('')
        })
        .catch(() => setSearchError('搜索失败，请重试'))
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [keyword, open, tab, excludeNodeId])

  // 切到页面树页签时拉取整棵树
  useEffect(() => {
    if (!open || tab !== 'tree' || !spaceId) return
    setTree(null)
    setTreeError('')
    getTree(spaceId)
      .then((data) => setTree(data.nodes ?? []))
      .catch(() => setTreeError('页面树加载失败，请重试'))
  }, [open, tab, spaceId])

  const pick = (page: PickedPage) => {
    onPick(page)
    onClose()
  }

  const tabBtn = (key: 'search' | 'tree', label: string) => (
    <button
      type="button"
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        tab === key ? 'bg-slate-900/5 font-medium text-slate-800' : 'text-slate-500 hover:text-slate-700',
      )}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  )

  const body = useMemo(() => {
    if (tab === 'search') {
      return (
        <>
          <Input
            autoFocus
            value={keyword}
            placeholder="输入标题关键词搜索本页之外的页面…"
            onChange={(e) => setKeyword(e.target.value)}
            prefix={<Search size={15} />}
          />
          <DialogError message={searchError} />
          <div className="max-h-72 overflow-y-auto">
            {!keyword.trim() && (
              <p className="px-1 py-6 text-center text-xs text-slate-400">输入关键词开始搜索</p>
            )}
            {keyword.trim() && results.length === 0 && !searching && !searchError && (
              <p className="px-1 py-6 text-center text-xs text-slate-400">无匹配页面</p>
            )}
            {results.map((r) => (
              <button
                key={r.nodeId}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                onClick={() => pick({ nodeId: r.nodeId, title: r.title })}
              >
                <FileText size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.spaceName && <span className="shrink-0 text-[11px] text-slate-400">{r.spaceName}</span>}
              </button>
            ))}
          </div>
        </>
      )
    }
    if (treeError) return <DialogError message={treeError} />
    if (!tree) {
      return <p className="px-1 py-8 text-center text-xs text-slate-400">页面树加载中…</p>
    }
    if (tree.length === 0) {
      return <p className="px-1 py-8 text-center text-xs text-slate-400">空间内暂无页面</p>
    }
    return (
      <div className="max-h-72 overflow-y-auto">
        {tree.map((n) => (
          <TreeItem key={n.id} node={n} depth={0} excludeNodeId={excludeNodeId} defaultOpen onPick={pick} />
        ))}
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, keyword, results, searching, searchError, tree, treeError, excludeNodeId])

  return (
    <Dialog open={open} title="选择要引用的页面" onClose={onClose} width={440}>
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabBtn('search', '搜索')}
        {tabBtn('tree', '页面树')}
      </div>
      {body}
    </Dialog>
  )
}
