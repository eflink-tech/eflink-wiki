/**
 * 空间成员管理弹窗：成员列表（改角色 / 移除）+ 用户组授权（整组按角色授权进空间）。
 * 添加成员用即搜即选输入框（点击/回车直接加入），组授权用下拉选择。
 * 挂载点：AppLayout「空间管理」弹窗、SpacePage 头部。
 *   <MemberManageDialog spaceId={spaceId} open={open} onClose={...} />
 */
import { UserMinus, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SpaceGroupItem, UserBrief, UserGroupOption } from '../../api/wiki'
import * as wikiApi from '../../api/wiki'
import { Button } from '../Button'
import { ConfirmDialog, Dialog, DialogError } from '../Dialog'
import { Spinner } from '../Loading'
import UserSearchInput from '../UserSearchInput'
import { toast } from '../Toast'
import { cn } from '../../lib/utils'

/** 空间角色数值 → 文案（1 管理员 2 编辑者 3 查看者） */
const SPACE_ROLE_NAMES: Record<number, string> = {
  1: '管理员',
  2: '编辑者',
  3: '查看者',
}

/** 组来源文案 */
const GROUP_SOURCE_NAMES: Record<number, string> = {
  1: '手动',
  2: 'LDAP',
}

/** 分区标题：名称 + 计数徽标 */
function SectionHeader({ label, count }: { label: string; count: number | null }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[13px] font-medium text-slate-600">{label}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        {count ?? '…'}
      </span>
    </div>
  )
}

/** 行内角色下拉（原生 select，轻量起见） */
function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (v: 1 | 2 | 3) => void
}) {
  return (
    <select
      className={cn(
        'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-700 outline-none transition-colors focus:border-blue-500',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3)}
    >
      <option value={1}>管理员</option>
      <option value={2}>编辑者</option>
      <option value={3}>查看者</option>
    </select>
  )
}

/** 成员头像（有图用图，无图用姓名首字） */
function MemberAvatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  return avatar ? (
    <img src={avatar} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-blue-600 font-medium text-white"
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

interface MemberManageDialogProps {
  spaceId: number
  open: boolean
  onClose: () => void
}

/** 成员管理弹窗（默认导出） */
export default function MemberManageDialog({ spaceId, open, onClose }: MemberManageDialogProps) {
  const [members, setMembers] = useState<wikiApi.MemberItem[] | null>(null)
  const [groups, setGroups] = useState<SpaceGroupItem[] | null>(null)
  const [groupOptions, setGroupOptions] = useState<UserGroupOption[]>([])
  const [newGroupId, setNewGroupId] = useState(0)
  const [newGroupRole, setNewGroupRole] = useState<1 | 2 | 3>(3)
  const [newRole, setNewRole] = useState<1 | 2 | 3>(3)
  const [rowError, setRowError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<wikiApi.MemberItem | null>(null)
  const [removeGroupTarget, setRemoveGroupTarget] = useState<SpaceGroupItem | null>(null)

  const load = useCallback(async () => {
    setMembers(null)
    setGroups(null)
    try {
      const [memberRes, groupRes] = await Promise.all([
        wikiApi.listMembers(spaceId),
        wikiApi.listSpaceGroups(spaceId),
      ])
      setMembers(memberRes.list)
      setGroups(groupRes.list)
    } catch {
      // 拦截器已提示
      setMembers([])
      setGroups([])
    }
  }, [spaceId])

  /* 弹窗每次打开拉取数据并重置添加区状态 */
  useEffect(() => {
    if (!open) return
    void load()
    setNewGroupId(0)
    setNewGroupRole(3)
    setNewRole(3)
    setRowError('')
    wikiApi
      .listGroupOptions()
      .then((res) => setGroupOptions(res.list))
      .catch(() => setGroupOptions([]))
  }, [open, load])

  /** 添加成员：选人即加入（角色取右侧下拉当前值） */
  const addMember = async (u: UserBrief) => {
    try {
      await wikiApi.addMember(spaceId, { userId: u.id, role: newRole })
      toast.success(`已添加 ${u.displayName}（${SPACE_ROLE_NAMES[newRole]}）`)
      void load()
    } catch {
      // 拦截器已提示（如用户不存在 / 已是成员）
    }
  }

  /** 修改成员角色 */
  const changeRole = async (m: wikiApi.MemberItem, role: 1 | 2 | 3) => {
    try {
      await wikiApi.updateMember(spaceId, m.id, { role })
      toast.success(`已将 ${m.displayName} 的角色改为${SPACE_ROLE_NAMES[role]}`)
      void load()
    } catch {
      // 拦截器已提示；失败后重新拉取还原下拉显示
      void load()
    }
  }

  /** 尚未授权到本空间的组（添加下拉里排除已授权的） */
  const grantableGroups = groupOptions.filter(
    (g) => !groups?.some((granted) => granted.groupId === g.id),
  )

  /** 添加组授权 */
  const addGroup = async () => {
    if (!newGroupId) {
      setRowError('请选择要授权的用户组')
      return
    }
    try {
      await wikiApi.addSpaceGroup(spaceId, { groupId: newGroupId, role: newGroupRole })
      toast.success('用户组已授权')
      setNewGroupId(0)
      void load()
    } catch {
      // 拦截器已提示
    }
  }

  /** 修改组授权角色 */
  const changeGroupRole = async (g: SpaceGroupItem, role: 1 | 2 | 3) => {
    try {
      await wikiApi.updateSpaceGroup(spaceId, g.id, { role })
      toast.success(`已将组「${g.groupName}」的角色改为${SPACE_ROLE_NAMES[role]}`)
      void load()
    } catch {
      void load()
    }
  }

  if (!open) return null

  return (
    <>
      <Dialog open title="成员管理" width={640} onClose={onClose}>
        {/* 添加成员：输入即搜，点击直接加入 */}
        <div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <UserSearchInput
                autoFocus
                excludeUserIds={(members ?? []).map((m) => m.userId)}
                excludeLabel="已是成员"
                onPick={addMember}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[13px] text-slate-500">角色</span>
              <RoleSelect
                value={newRole}
                onChange={(v) => {
                  setNewRole(v)
                  setRowError('')
                }}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">输入即搜，点击结果（或按回车）直接加入，角色用右侧当前选择</p>
        </div>

        {/* 成员列表 */}
        <div className="mt-5">
          <SectionHeader label="成员" count={members?.length ?? null} />
          <div className="rounded-lg border border-slate-200">
            {members === null && (
              <div className="flex justify-center py-10">
                <Spinner size={20} />
              </div>
            )}
            {members !== null && members.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">
                还没有直接成员；若空间设为「登录可读」，全员可读
              </p>
            )}
            {members !== null && members.length > 0 && (
              <ul className="divide-y divide-slate-50">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                    <MemberAvatar name={m.displayName} avatar={m.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{m.displayName}</p>
                      <p className="truncate text-xs text-slate-400">@{m.username}</p>
                    </div>
                    <RoleSelect value={m.role} onChange={(r) => void changeRole(m, r)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      title="移除成员"
                      className="shrink-0"
                      onClick={() => setRemoveTarget(m)}
                    >
                      <UserMinus size={14} /> 移除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 用户组授权 */}
        <div className="mt-5">
          <SectionHeader label="用户组授权" count={groups?.length ?? null} />
          <div className="rounded-lg border border-slate-200">
            {groups === null && (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            )}
            {groups !== null && groups.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                尚未授权任何用户组，整组授权更快
              </p>
            )}
            {groups !== null && groups.length > 0 && (
              <ul className="divide-y divide-slate-50">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                      <Users size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-700">
                        <span className="truncate">{g.groupName}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
                          {GROUP_SOURCE_NAMES[g.groupSource] ?? '-'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">{g.memberCount} 人</p>
                    </div>
                    <RoleSelect value={g.role} onChange={(r) => void changeGroupRole(g, r)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      title="移除组授权"
                      className="shrink-0"
                      onClick={() => setRemoveGroupTarget(g)}
                    >
                      <UserMinus size={14} /> 移除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 添加组授权 */}
          {grantableGroups.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <select
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-blue-500"
                value={newGroupId}
                onChange={(e) => {
                  setNewGroupId(Number(e.target.value))
                  setRowError('')
                }}
              >
                <option value={0}>选择要授权的用户组…</option>
                {grantableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}（{g.memberCount} 人）
                  </option>
                ))}
              </select>
              <RoleSelect value={newGroupRole} onChange={setNewGroupRole} />
              <Button
                variant="primary"
                size="sm"
                className="shrink-0"
                onClick={() => void addGroup()}
              >
                <UserPlus size={14} /> 授权
              </Button>
            </div>
          )}
        </div>
        <DialogError message={rowError} />
      </Dialog>

      {/* 移除成员确认 */}
      <ConfirmDialog
        open={removeTarget !== null}
        title="移除成员"
        danger
        confirmText="移除"
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          await wikiApi.removeMember(spaceId, removeTarget.id)
          toast.success(`已移除 ${removeTarget.displayName}`)
          void load()
        }}
        content={
          removeTarget
            ? `确定将「${removeTarget.displayName}（@${removeTarget.username}）」移出本空间吗？`
            : ''
        }
      />

      {/* 移除组授权确认 */}
      <ConfirmDialog
        open={removeGroupTarget !== null}
        title="移除组授权"
        danger
        confirmText="移除"
        onClose={() => setRemoveGroupTarget(null)}
        onConfirm={async () => {
          if (!removeGroupTarget) return
          await wikiApi.removeSpaceGroup(spaceId, removeGroupTarget.id)
          toast.success(`已移除组「${removeGroupTarget.groupName}」的授权`)
          void load()
        }}
        content={
          removeGroupTarget
            ? `确定移除组「${removeGroupTarget.groupName}」在本空间的授权吗？组内 ${removeGroupTarget.memberCount} 名成员将失去对应权限。`
            : ''
        }
      />
    </>
  )
}
