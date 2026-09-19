import {
  ArrowLeft,
  Ban,
  Check,
  Ellipsis,
  FileSpreadsheet,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as adminApi from '../../api/admin'
import type { PageResult, UserInfo } from '../../api/types'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { Dropdown, DropdownItem } from '../../components/Dropdown'
import { Input } from '../../components/Input'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import { cn, fmtDate } from '../../lib/utils'

const PAGE_SIZE = 10

/** 角色徽标 */
function RoleBadge({ role }: { role: 1 | 2 }) {
  return (
    <span
      className={cn(
        'inline-block rounded-ctrl px-1.5 py-0.5 text-meta',
        role === 1 ? 'bg-brand-light text-brand' : 'bg-sunken text-ink-3',
      )}
    >
      {role === 1 ? '管理员' : '普通用户'}
    </span>
  )
}

/** 状态徽标 */
function StatusBadge({ status }: { status: 1 | 2 | undefined }) {
  const disabled = status === 2
  return (
    <span
      className={cn(
        'inline-block rounded-ctrl px-1.5 py-0.5 text-meta',
        disabled ? 'bg-danger-light text-danger' : 'bg-success-light text-success',
      )}
    >
      {disabled ? '已禁用' : '正常'}
    </span>
  )
}

/** 角色选择下拉（原生 select，轻量起见不做自定义组件） */
function RoleSelect({
  value,
  onChange,
}: {
  value: 1 | 2
  onChange: (v: 1 | 2) => void
}) {
  return (
    <select
      className="h-9 w-full rounded-ctrl border border-line bg-surface px-2 text-sm text-ink-1 outline-none transition-colors focus:border-brand"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as 1 | 2)}
    >
      <option value={2}>普通用户</option>
      <option value={1}>管理员</option>
    </select>
  )
}

/** 新建用户弹窗 */
function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<1 | 2>(2)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!username.trim() || !displayName.trim() || !password) {
      toast.error('请填写完整信息')
      return
    }
    if (password.length < 6) {
      toast.error('初始密码至少 6 位')
      return
    }
    setSaving(true)
    try {
      await adminApi.createUser({
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        role,
      })
      toast.success('用户已创建')
      onCreated()
      onClose()
    } catch {
      // 拦截器已提示（如用户名重复）
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title="新建用户"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            创建
          </Button>
        </>
      }
    >
      <Input
        label="用户名"
        placeholder="登录账号（不可重复）"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        label="姓名"
        placeholder="显示名称"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <Input
        label="初始密码"
        type="password"
        placeholder="至少 6 位"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="block">
        <span className="mb-1.5 block text-meta font-medium text-ink-2">角色</span>
        <RoleSelect value={role} onChange={setRole} />
      </label>
    </Dialog>
  )
}

/** 重置密码弹窗 */
function ResetPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserInfo
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (password.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    setSaving(true)
    try {
      await adminApi.updateUser(user.id, { password })
      toast.success(`已重置 ${user.displayName} 的密码`)
      onSaved()
      onClose()
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title={`重置密码 - ${user.displayName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            确定
          </Button>
        </>
      }
    >
      <Input
        label="新密码"
        type="password"
        placeholder="至少 6 位"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </Dialog>
  )
}

/** 修改角色弹窗 */
function ChangeRoleDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserInfo
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<1 | 2>(user.role)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await adminApi.updateUser(user.id, { role })
      toast.success('角色已修改')
      onSaved()
      onClose()
    } catch {
      // 拦截器已提示
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title={`修改角色 - ${user.displayName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            确定
          </Button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-meta font-medium text-ink-2">角色</span>
        <RoleSelect value={role} onChange={setRole} />
      </label>
    </Dialog>
  )
}

/** 批量导入结果（与 adminApi.importUsers 返回一致） */
interface ImportResult {
  created: number
  skipped: number
  errors: string[]
}

/** 批量导入用户弹窗：选择 xlsx/csv 上传，展示 created / skipped / errors 结果 */
function ImportUsersDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const submit = async () => {
    if (!file) {
      toast.error('请先选择要导入的文件')
      return
    }
    setUploading(true)
    try {
      const r = await adminApi.importUsers(file)
      setResult(r)
      toast.success(`导入完成：新建 ${r.created} 个用户`)
      onImported() // 成功后刷新用户列表（弹窗保持打开展示结果）
    } catch {
      // 拦截器已提示
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog
      open
      title="批量导入用户"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>关闭</Button>
          <Button
            variant="primary"
            loading={uploading}
            disabled={file === null || result !== null}
            onClick={() => void submit()}
          >
            <Upload size={14} /> {result ? '已导入' : '开始导入'}
          </Button>
        </>
      }
    >
      {/* 模板列说明 */}
      <div className="mb-3 rounded-ctrl bg-brand-light px-3 py-2.5 text-meta leading-5 text-brand">
        <p className="font-medium">文件模板列（第一行为表头，按以下顺序）：</p>
        <p>用户名（必填）/ 姓名（必填）/ 初始密码（可选）/ 角色（可选）</p>
        <p>支持 .xlsx / .csv；用户名已存在的行将被跳过并在结果中说明。</p>
      </div>

      {/* 文件选择 */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null) // 重新选文件后清除上一次的结果
          }}
        />
        <Button onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet size={15} /> 选择文件
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-3">
          {file ? file.name : '未选择文件（.xlsx / .csv）'}
        </span>
      </div>

      {/* 导入结果 */}
      {result && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex gap-4 text-sm">
            <span className="font-medium text-success">新建 {result.created}</span>
            <span className="font-medium text-warning-ink">跳过 {result.skipped}</span>
            <span
              className={cn(
                'font-medium',
                result.errors.length > 0 ? 'text-danger' : 'text-ink-3',
              )}
            >
              错误 {result.errors.length}
            </span>
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto rounded-ctrl bg-danger-light p-2.5 pl-6 text-meta leading-5 text-danger">
              {result.errors.map((e, i) => (
                <li key={i} className="break-all">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  )
}

/** 管理后台 · 用户管理（仅 role=1 可访问，路由层已做守卫） */
export default function AdminUsersPage() {
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<UserInfo> | null>(null)
  const [loading, setLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [resetUser, setResetUser] = useState<UserInfo | null>(null)
  const [roleUser, setRoleUser] = useState<UserInfo | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await adminApi.listUsers({
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

  const toggleStatus = async (u: UserInfo) => {
    try {
      await adminApi.updateUser(u.id, { status: u.status === 2 ? 1 : 2 })
      toast.success(u.status === 2 ? '已启用' : '已禁用')
      void load()
    } catch {
      // 拦截器已提示
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-sunken">
      {/* 顶栏 */}
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="font-semibold text-ink-1">管理后台 · 用户管理</h1>
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
            <Input
              placeholder="搜索用户名或姓名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button type="submit" onClick={search}>
              <Search size={14} /> 查询
            </Button>
          </form>
          <Button className="ml-auto" onClick={() => setImportOpen(true)}>
            <Upload size={15} /> 批量导入
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> 新建用户
          </Button>
        </div>

        {/* 用户表格 */}
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          {loading && (
            <div className="flex justify-center pb-3">
              <Spinner size={18} />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-meta font-medium text-ink-3">
                <th className="py-2.5 pr-4">用户名</th>
                <th className="py-2.5 pr-4">姓名</th>
                <th className="py-2.5 pr-4">角色</th>
                <th className="py-2.5 pr-4">状态</th>
                <th className="py-2.5 pr-4">创建时间</th>
                <th className="py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.list.map((u) => (
                <tr key={u.id} className="hover:bg-sunken">
                  <td className="py-2.5 pr-4 text-ink-1">{u.username}</td>
                  <td className="py-2.5 pr-4 text-ink-1">{u.displayName}</td>
                  <td className="py-2.5 pr-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-ink-3">{fmtDate(u.createdAt)}</td>
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
                        icon={<KeyRound size={14} />}
                        onClick={() => setResetUser(u)}
                      >
                        重置密码
                      </DropdownItem>
                      <DropdownItem
                        icon={<ShieldCheck size={14} />}
                        onClick={() => setRoleUser(u)}
                      >
                        修改角色
                      </DropdownItem>
                      <DropdownItem
                        icon={u.status === 2 ? <Check size={14} /> : <Ban size={14} />}
                        danger={u.status !== 2}
                        onClick={() => void toggleStatus(u)}
                      >
                        {u.status === 2 ? '启用' : '禁用'}
                      </DropdownItem>
                    </Dropdown>
                  </td>
                </tr>
              ))}
              {data && data.list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <Users size={28} className="mx-auto mb-2 text-ink-3" />
                    没有匹配的用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-meta text-ink-3">
            <span>共 {total} 名用户</span>
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
      {createOpen && (
        <CreateUserDialog onClose={() => setCreateOpen(false)} onCreated={() => void load()} />
      )}
      {importOpen && (
        <ImportUsersDialog onClose={() => setImportOpen(false)} onImported={() => void load()} />
      )}
      {resetUser && (
        <ResetPasswordDialog
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => void load()}
        />
      )}
      {roleUser && (
        <ChangeRoleDialog
          user={roleUser}
          onClose={() => setRoleUser(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
