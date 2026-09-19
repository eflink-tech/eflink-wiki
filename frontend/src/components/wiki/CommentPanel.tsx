/**
 * 页面评论区：评论列表（楼中楼缩进 + 气泡样式）+ 发表 + 回复 + 删除。
 * 供 PageView 等页面挂载：<CommentPanel nodeId={nodeId} />
 *
 * 2026-09-17 UI 改版（P2）：白画布上不再用整卡包裹，改为分隔线 + 平铺区块；
 * 无评论时折叠为一行入口「还没有评论，写第一条 →」，点击才展开输入区（方案 §2.3）。
 */
import { CornerDownLeft, MessageSquare, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentItem } from '../../api/wiki'
import type { MemberItem } from '../../api/wiki'
import { listMembers } from '../../api/wiki'
import * as wikiApi from '../../api/wiki'
import { AtSign } from 'lucide-react'
import { Button } from '../Button'
import { ConfirmDialog } from '../Dialog'
import { Spinner } from '../Loading'
import { Textarea } from '../Input'
import { toast } from '../Toast'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/utils'

/** 时间戳 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳；空值显示 '-'） */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 字符头像：有头像地址用图片，否则取姓名首字 */
function CommentAvatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-brand text-xs font-medium text-white">
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  )
}

interface CommentPanelProps {
  /** 页面（节点）ID */
  nodeId: number
  /** 所属空间 ID（传入后启用评论 @提及：仅空间内成员） */
  spaceId?: number
}

/** 评论面板（默认导出）：进入自动拉取评论列表 */
export default function CommentPanel({ nodeId, spaceId }: CommentPanelProps) {
  const me = useAuthStore((s) => s.user)
  const [items, setItems] = useState<CommentItem[] | null>(null)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** 当前回复的目标（null 表示发表一级评论） */
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  /** 待删除的评论（弹出确认框） */
  const [deleteTarget, setDeleteTarget] = useState<CommentItem | null>(null)
  /** 空态是否已被用户主动展开（点「写第一条」后本次挂载内保持展开） */
  const [expanded, setExpanded] = useState(false)
  /** @提及：已选成员（id 去重）+ 成员选择器开合 */
  const [mentionIds, setMentionIds] = useState<number[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  /** 空间成员（用于 @ 选择与正文 @名字 高亮） */
  const [members, setMembers] = useState<MemberItem[]>([])

  useEffect(() => {
    if (!spaceId) return
    listMembers(spaceId)
      .then((res) => setMembers(res.list))
      .catch(() => {})
  }, [spaceId])

  const pickMention = (m: MemberItem) => {
    setMentionOpen(false)
    if (mentionIds.includes(m.userId)) return
    setMentionIds((prev) => [...prev, m.userId])
    setContent((prev) => (prev.trim() ? `${prev.replace(/\s*$/, '')} @${m.displayName} ` : `@${m.displayName} `))
  }
  /** 输入区容器（展开后自动聚焦 textarea） */
  const inputWrapRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setItems(null)
    try {
      const res = await wikiApi.listComments(nodeId)
      setItems(res.list)
    } catch {
      // 拦截器已提示错误；置空避免卡加载态
      setItems([])
    }
  }, [nodeId])

  useEffect(() => {
    void load()
  }, [load])

  /** 发表评论（有 replyTo 时作为楼中楼回复） */
  const submit = async () => {
    const v = content.trim()
    if (!v) {
      toast.error('请输入评论内容')
      return
    }
    setSubmitting(true)
    try {
      await wikiApi.addComment(nodeId, {
        content: v,
        parentId: replyTo ? replyTo.id : undefined,
        mentionUserIds: mentionIds,
      })
      setContent('')
      setMentionIds([])
      setReplyTo(null)
      toast.success('评论已发表')
      void load()
    } catch {
      // 拦截器已提示
    } finally {
      setSubmitting(false)
    }
  }

  /** 本人或系统管理员可删除 */
  const canDelete = (c: CommentItem) =>
    me != null && (me.id === c.userId || me.role === 1)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await wikiApi.deleteComment(deleteTarget.id)
    toast.success('评论已删除')
    void load()
  }

  /* 楼中楼分组：parentId>0 的挂到对应父评论下；父评论已删的作为孤儿兜底展示 */
  const tops: CommentItem[] = []
  const repliesByParent = new Map<number, CommentItem[]>()
  const orphans: CommentItem[] = []
  if (items) {
    const ids = new Set(items.map((c) => c.id))
    for (const c of items) {
      if (c.parentId > 0) {
        if (ids.has(c.parentId)) {
          const arr = repliesByParent.get(c.parentId) ?? []
          arr.push(c)
          repliesByParent.set(c.parentId, arr)
        } else {
          orphans.push(c)
        }
      } else {
        tops.push(c)
      }
    }
  }

  /** 正文渲染：把 @成员名 高亮（仅对真实空间成员名生效，其余原样文本） */
  const renderContent = (text: string) => {
    if (members.length === 0) return text
    const names = members.map((m) => m.displayName).filter(Boolean).sort((a, b) => b.length - a.length)
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (escaped.length === 0) return text
    const re = new RegExp(`(@)(?:${escaped.join('|')})`, 'g')
    const parts: (string | { mention: string })[] = []
    let last = 0
    for (const match of text.matchAll(re)) {
      const idx = match.index ?? 0
      if (idx > last) parts.push(text.slice(last, idx))
      parts.push({ mention: match[0] })
      last = idx + match[0].length
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts.map((part, i) =>
      typeof part === 'string' ? (
        part
      ) : (
        <span key={i} className="font-medium text-brand">
          {part.mention}
        </span>
      ),
    )
  }

  /** 单条评论行：头像 + sunken 气泡（名字/时间/正文）+ 气泡下操作行 */
  const renderRow = (c: CommentItem, nested: boolean) => (
    <div key={c.id} className={cn('flex gap-2.5', nested && 'mt-3 pl-9')}>
      <CommentAvatar name={c.displayName} avatar={c.avatar} />
      <div className="min-w-0 flex-1">
        <div className="rounded-[10px] bg-sunken px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta font-medium text-ink-1">{c.displayName}</span>
            <span className="text-xs text-ink-3">{fmtTs(c.createdAt)}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-2">
            {renderContent(c.content)}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-3 px-1 text-xs text-ink-3">
          <button
            type="button"
            className="flex items-center gap-1 transition-colors hover:text-brand"
            onClick={() => setReplyTo(c)}
          >
            <CornerDownLeft size={12} /> 回复
          </button>
          {canDelete(c) && (
            <button
              type="button"
              title="删除评论"
              className="flex items-center gap-1 transition-colors hover:text-danger"
              onClick={() => setDeleteTarget(c)}
            >
              <Trash2 size={12} /> 删除
            </button>
          )}
        </div>
      </div>
    </div>
  )

  /* 空态折叠：无评论且未主动展开时只显示一行入口（方案 §2.3 缺陷3） */
  if (items !== null && items.length === 0 && !expanded) {
    return (
      <div className="mt-9 border-t border-line pt-5">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-meta text-ink-3 transition-colors hover:text-brand"
          onClick={() => {
            setExpanded(true)
            window.setTimeout(
              () => inputWrapRef.current?.querySelector('textarea')?.focus(),
              0,
            )
          }}
        >
          <MessageSquare size={15} />
          还没有评论，写第一条 →
        </button>
      </div>
    )
  }

  return (
    <div className="mt-9 border-t border-line pt-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
        评论
        {items && items.length > 0 && (
          <span className="font-normal text-ink-3">· {items.length}</span>
        )}
      </h2>

      {/* 列表 */}
      {items === null && (
        <div className="flex justify-center py-8">
          <Spinner size={20} />
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-4 space-y-4">
          {tops.map((c) => (
            <div key={c.id}>
              {renderRow(c, false)}
              {/* 楼中楼：子评论缩进展示 */}
              {(repliesByParent.get(c.id) ?? []).map((r) => renderRow(r, true))}
            </div>
          ))}
          {/* 父评论已删除的回复：缩进兜底展示 */}
          {orphans.map((r) => renderRow(r, true))}
        </div>
      )}

      {/* 输入区 */}
      <div className="mt-4" ref={inputWrapRef}>
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
            <span>
              回复 <span className="font-medium text-brand">@{replyTo.displayName}</span>
            </span>
            <button
              type="button"
              title="取消回复"
              className="text-ink-3 transition-colors hover:text-ink-2"
              onClick={() => setReplyTo(null)}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {spaceId && mentionOpen && members.length > 0 && (
          <div className="mb-2 max-h-44 w-56 overflow-y-auto rounded-pop border border-line bg-surface p-1 shadow-3">
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1"
                onClick={() => pickMention(m)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white">
                  {(m.displayName || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                {mentionIds.includes(m.userId) && <span className="text-meta text-ink-3">已选</span>}
              </button>
            ))}
          </div>
        )}
        <Textarea
          rows={2}
          placeholder={replyTo ? `回复 @${replyTo.displayName}…` : '写下你的评论…'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl / Cmd + Enter 快捷发送
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit()
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {spaceId && members.length > 0 && (
              <button
                type="button"
                title="@ 空间成员"
                className="flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-brand"
                onClick={() => setMentionOpen((o) => !o)}
              >
                <AtSign size={13} /> @成员
              </button>
            )}
            <span className="text-xs text-ink-3">Ctrl / Cmd + Enter 发送</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={!content.trim()}
            onClick={() => void submit()}
          >
            <Send size={14} /> 发表评论
          </Button>
        </div>
      </div>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除评论"
        danger
        confirmText="删除"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        content={
          deleteTarget
            ? `确定删除「${deleteTarget.displayName}」的这条评论吗？删除后不可恢复。`
            : ''
        }
      />
    </div>
  )
}
