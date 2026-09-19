/**
 * 管理后台 · 用户组管理：组分页表格（新建/编辑/删除）+ 组成员管理子弹窗（搜索添加/移除）。
 * 空间授权在各空间的成员管理弹窗中操作，本页只维护组本身。
 */
import {
  ArrowLeft,
  Ellipsis,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../../api/admin'
import * as wikiApi from '../../api/wiki'
import type { PageResult } from '../../api/types'
import { Button } from '../../components/Button'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { Dropdown, DropdownItem } from '../../components/Dropdown'
import { Input } from '../../components/Input'
import { Spinner } from '../../components/Loading'
import UserSearchInput from '../../components/UserSearchInput'
import { toast } from '../../components/Toast'
import { cn, fmtDate } from '../../lib/utils'

const PAGE_SIZE = 10

/** epoch 毫秒 → 日期串（fmtDate 接收字符串） */
const fmtEpoch = (v: number | null) => (v == null ? '-' : fmtDate(new Date(v).toISOString()))

/** 组来源徽标 */
function SourceBadge({ source }: { source: 1 | 2 }) {
  return (
    <span
      className={cn(
        'inline-block rounded-ctrl px-1.5 py-0.5 text-meta',
        source === 2 ? 'bg-brand-light text-brand' : 'bg-sunken text-ink-3',
      )}
    >
      {source === 2 ? 'LDAP 同步' : '手动'}
    </span>
  )
}

/** 新建/编辑组弹窗 */
function GroupFormDialog({
  group,
  onClose,
  onSaved,
}: {
  group: adminApi.UserGroupItem | null // null = 新建
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      toast.error('请填写组名')
      return
    }
    setSaving(true)
    try {
      if (group) {
        await adminApi.updateGroup(group.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        })
        toast.success('用户组已更新')
      } else {
        await adminApi.createGroup({
          name: name.trim(),
          description: description.trim() || undefined,
        })
        toast.success('用户组已创建')
      }
      onSaved()
      onClose()
    } catch {
      // 拦截器已提示（如组名重复）
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title={group ? `编辑用户组 - ${group.name}` : '新建用户组'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {group ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <Input
        label="组名"
        placeholder="用户组名称（不可重复）"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="描述"
        placeholder="选填"
        value={description ?? ''}
        onChange={(e) => setDescription(e.target.value)}
      />
    </Dialog>
  )
}

/** 组成员管理弹窗：即搜即加入组 + 成员列表（宽松布局） */
function GroupMembersDialog({
  group,
  onClose,
  onChanged,
}: {
  group: adminApi.UserGroupItem
  onClose: () => void
  onChanged: () => void
}) {
  const [members, setMembers] = useState<adminApi.GroupMemberItem[] | null>(null)
  const [removeTarget, setRemoveTarget] = useState<adminApi.GroupMemberItem | null>(null)

  const load = useCallback(async () => {
    setMembers(null)
    try {
      const res = await adminApi.listGroupMembers(group.id)
      setMembers(res.list)
    } catch {
      setMembers([])
    }
  }, [group.id])

  useEffect(() => {
    if (group.id) void load()
  }, [group.id, load])

  const add = async (u: wikiApi.UserBrief) => {
    try {
      await adminApi.addGroupMember(group.id, { userId: u.id })
      toast.success(`已将 ${u.displayName} 加入「${group.name}」`)
      void load()
      onChanged()
    } catch {
      // 拦截器已提示（如已是成员）
    }
  }

  return (
    <>
      <Dialog open title={`组成员 - ${group.name}`} width={640} onClose={onClose}>
        {/* 添加成员：输入即搜，点击直接加入 */}
        <div>
          <UserSearchInput
            autoFocus
            excludeUserIds={(members ?? []).map((m) => m.userId)}
            excludeLabel="已在组内"
            onPick={add}
          />
          <p className="mt-1.5 text-xs text-slate-400">输入即搜，点击结果（或按回车）直接加入组</p>
        </div>

        {/* 成员列表 */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-600">组成员</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {members?.length ?? '…'}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200">
            {members === null && (
              <div className="flex justify-center py-10">
                <Spinner size={20} />
              </div>
            )}
            {members !== null && members.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">
                还没有成员，用上方搜索框把第一批人拉进来
              </p>
            )}
            {members !== null && members.length > 0 && (
              <ul className="divide-y divide-slate-50">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                    {m.avatar ? (
                      <img
                        src={m.avatar}
                        alt={m.displayName}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                        {(m.displayName || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{m.displayName}</p>
                      <p className="truncate text-xs text-slate-400">@{m.username}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{fmtEpoch(m.createdAt)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="移出组"
                      className="shrink-0"
                      onClick={() => setRemoveTarget(m)}
                    >
                      <UserMinus size={14} /> 移出
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title="移出组成员"
        danger
        confirmText="移出"
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          await adminApi.removeGroupMember(group.id, removeTarget.id)
          toast.success(`已将 ${removeTarget.displayName} 移出组`)
          void load()
          onChanged()
        }}
        content={
          removeTarget
            ? `确定将「${removeTarget.displayName}（@${removeTarget.username}）」移出本组吗？其在各空间经本组获得的权限将一并失去。`
            : ''
        }
      />
    </>
  )
}

/** 管理后台 · 用户组管理（仅 role=1 可访问，路由层已做守卫） */
export default function AdminGroupsPage() {
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<adminApi.UserGroupItem> | null>(null)
  const [loading, setLoading] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<adminApi.UserGroupItem | null>(null)
  const [memberGroup, setMemberGroup] = useState<adminApi.UserGroupItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<adminApi.UserGroupItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await adminApi.listGroups({
          keyword: applied || undefined,
          page,
          size: PAGE_SIZE,
        }),
      )
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false)
    }
  }, [applied, page])

  useEffect(() => {
    void load()
  }, [load])

  const search = () => {
    setPage(1)
    setApplied(keyword.trim())
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · 用户组管理</h1>
        <Link
          to="/app"
          className="ml-auto flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-brand"
        >
          <ArrowLeft size={14} />
          返回知识库
        </Link>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {/* 工具条 */}
        <div className="flex items-center gap-3">
          <form
            className="flex w-72 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              search()
            }}
          >
            <Input placeholder="搜索组名或描述" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" onClick={search}>
              <Search size={14} /> 查询
            </Button>
          </form>
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => setFormOpen(true)}
          >
            <Plus size={15} /> 新建用户组
          </Button>
        </div>

        {/* 组表格 */}
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          {loading && (
            <div className="flex justify-center pb-3">
              <Spinner size={18} />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-meta font-medium text-ink-3">
                <th className="py-2.5 pr-4">组名</th>
                <th className="py-2.5 pr-4">来源</th>
                <th className="py-2.5 pr-4">成员数</th>
                <th className="py-2.5 pr-4">授权空间数</th>
                <th className="py-2.5 pr-4">创建时间</th>
                <th className="py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.list.map((g) => (
                <tr key={g.id} className="hover:bg-sunken">
                  <td className="py-2.5 pr-4 text-ink-1">
                    <span className="font-medium">{g.name}</span>
                    {g.description && (
                      <span className="ml-2 text-meta text-ink-3">{g.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <SourceBadge source={g.source} />
                  </td>
                  <td className="py-2.5 pr-4 text-ink-1">{g.memberCount}</td>
                  <td className="py-2.5 pr-4 text-ink-1">{g.spaceCount}</td>
                  <td className="py-2.5 pr-4 text-ink-3">{fmtEpoch(g.createdAt)}</td>
                  <td className="py-2.5 text-right">
                    <Dropdown
                      align="right"
                      trigger={
                        <button
                          type="button"
                          title="更多操作"
                          className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-1"
                        >
                          <Ellipsis size={15} />
                        </button>
                      }
                    >
                      <DropdownItem
                        icon={<Users size={14} />}
                        onClick={() => setMemberGroup(g)}
                      >
                        成员管理
                      </DropdownItem>
                      <DropdownItem
                        icon={<Pencil size={14} />}
                        onClick={() => setEditGroup(g)}
                      >
                        编辑
                      </DropdownItem>
                      <DropdownItem
                        icon={<Trash2 size={14} />}
                        danger
                        onClick={() => setDeleteTarget(g)}
                      >
                        删除
                      </DropdownItem>
                    </Dropdown>
                  </td>
                </tr>
              ))}
              {data && data.list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <Users size={28} className="mx-auto mb-2 text-ink-3" />
                    没有匹配的用户组
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-meta text-ink-3">
            <span>共 {total} 个用户组</span>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <Button
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* 弹窗群 */}
      {formOpen && (
        <GroupFormDialog group={null} onClose={() => setFormOpen(false)} onSaved={() => void load()} />
      )}
      {editGroup && (
        <GroupFormDialog
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onSaved={() => void load()}
        />
      )}
      {memberGroup && (
        <GroupMembersDialog
          group={memberGroup}
          onClose={() => setMemberGroup(null)}
          onChanged={() => void load()}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除用户组"
        danger
        confirmText="删除"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await adminApi.deleteGroup(deleteTarget.id)
          toast.success(`已删除用户组「${deleteTarget.name}」`)
          void load()
        }}
        content={
          deleteTarget
            ? `确定删除用户组「${deleteTarget.name}」吗？组内 ${deleteTarget.memberCount} 名成员的组关系与 ${deleteTarget.spaceCount} 个空间的授权将一并移除。`
            : ''
        }
      />
    </div>
  )
}
