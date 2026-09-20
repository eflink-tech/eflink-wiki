import {
  BarChart3,
  BookOpen,
  ChevronsUpDown,
  Ellipsis,
  FileBadge,
  FileEdit,
  FileKey,
  House,
  KeyRound,
  LayoutTemplate,
  LogOut,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  Webhook,
} from 'lucide-react'
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/wiki-logo.png'
import * as authApi from '../api/auth'
import * as wikiApi from '../api/wiki'
import type { Space, TreeNode, UserInfo } from '../api/types'
import { Button } from '../components/Button'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { Dropdown, DropdownDivider, DropdownItem } from '../components/Dropdown'
import { Input, Textarea } from '../components/Input'
import { Spinner } from '../components/Loading'
import { toast } from '../components/Toast'
import { Tree } from '../components/Tree'
import MemberManageDialog from '../components/wiki/MemberManageDialog'
import NotificationBell from '../components/wiki/NotificationBell'
import { uploadImage } from '../components/editor/upload'
import { emitOpenSpaceForm, onOpenNodeCreate, onOpenSpaceForm, onTreeChanged, type SpaceFormPrefill } from '../lib/events'
import { ONBOARD_SPACE_KEY } from '../pages/login'
import { validateAvatarFile } from '../lib/avatarFile'
import { cn } from '../lib/utils'
import { useAuthStore } from '../store/authStore'

/** 我在空间内的角色名称 */
const SPACE_ROLE_NAMES: Record<number, string> = {
  1: '管理员',
  2: '编辑者',
  3: '查看者',
}

/** 在整树中查找 targetId 的祖先链（含自身），找不到返回 null */
function findPath(nodes: TreeNode[], targetId: number, trail: TreeNode[] = []): TreeNode[] | null {
  for (const n of nodes) {
    const next = [...trail, n]
    if (n.id === targetId) return next
    if (n.children.length > 0) {
      const found = findPath(n.children, targetId, next)
      if (found) return found
    }
  }
  return null
}

/** 从路径解析当前 spaceId / nodeId（父布局拿不到子路由的 params，直接解析 URL） */
function parsePath(pathname: string): { spaceId: number | null; nodeId: number | null } {
  const m = pathname.match(/^\/app\/space\/(\d+)(?:\/page\/(\d+))?/)
  return {
    spaceId: m ? Number(m[1]) : null,
    nodeId: m?.[2] ? Number(m[2]) : null,
  }
}

/** 头像：有图片地址则展示图片，加载失败或无地址时取姓名首字 */
function Avatar({
  name,
  src,
  size = 30,
}: {
  name: string
  src?: string | null
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [src])

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-brand font-medium text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  )
}

/** 空间图标方块 */
function SpaceBadge({ space, size = 28 }: { space: Space; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-card bg-brand text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {space.icon || space.name.slice(0, 1) || <BookOpen size={15} />}
    </span>
  )
}

/** 侧栏导航链接（行高 36px、图标 16px） */
function SidebarLink({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'mb-0.5 flex h-9 items-center gap-2 rounded-ctrl px-2.5 text-sm transition-colors',
        active
          ? 'bg-brand-light font-medium text-brand'
          : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
      )}
    >
      {icon}
      {label}
    </Link>
  )
}

/* ==================== 弹窗子组件 ==================== */

/** 新建 / 编辑空间表单弹窗 */
function SpaceFormDialog({
  mode,
  space,
  prefill,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  space?: Space | null
  prefill?: SpaceFormPrefill
  onClose: () => void
  onSubmit: (values: {
    name: string
    icon: string
    description: string
    visibility: 0 | 1
  }) => Promise<void>
}) {
  const [values, setValues] = useState({
    name: space?.name ?? prefill?.name ?? '',
    icon: space?.icon ?? '',
    description: space?.description ?? '',
    visibility: (space?.visibility ?? prefill?.visibility ?? 1) as 0 | 1,
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!values.name.trim()) {
      toast.error('请输入空间名称')
      return
    }
    setSaving(true)
    try {
      await onSubmit(values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title={mode === 'create' ? '新建空间' : '编辑空间'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
        </>
      }
    >
      <Input
        label="空间名称"
        placeholder="例如：产品团队知识库"
        value={values.name}
        onChange={(e) => setValues({ ...values, name: e.target.value })}
      />
      <Input
        label="图标（emoji，可选）"
        placeholder="📚"
        maxLength={4}
        value={values.icon}
        onChange={(e) => setValues({ ...values, icon: e.target.value })}
      />
      <Textarea
        label="描述（可选）"
        rows={2}
        placeholder="一句话介绍这个空间"
        value={values.description}
        onChange={(e) => setValues({ ...values, description: e.target.value })}
      />
      <div>
        <span className="mb-1.5 block text-meta font-medium text-ink-2">可见性</span>
        <div className="flex gap-5">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-2">
            <input
              type="radio"
              name="space-visibility"
              checked={values.visibility === 0}
              onChange={() => setValues({ ...values, visibility: 0 })}
            />
            私有（仅成员可见）
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-2">
            <input
              type="radio"
              name="space-visibility"
              checked={values.visibility === 1}
              onChange={() => setValues({ ...values, visibility: 1 })}
            />
            登录可读
          </label>
        </div>
      </div>
    </Dialog>
  )
}

/** 输入标题的弹窗（新建页面 / 重命名共用） */
function TitleDialog({
  title,
  label,
  initial,
  onClose,
  onSubmit,
}: {
  title: string
  label: string
  initial?: string
  onClose: () => void
  onSubmit: (text: string) => Promise<void>
}) {
  const [text, setText] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (saving) return
    const v = text.trim()
    if (!v) {
      toast.error(`请输入${label}`)
      return
    }
    setSaving(true)
    try {
      await onSubmit(v)
    } catch {
      // 拦截器已提示，弹窗保持打开
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      title={title}
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
        autoFocus
        label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
      />
    </Dialog>
  )
}

/** 个人信息弹窗 */
function ProfileDialog({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const setUser = useAuthStore((s) => s.setUser)
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [avatar, setAvatar] = useState(user.avatar ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const pickAvatar = async (file: File) => {
    const err = validateAvatarFile(file)
    if (err) {
      toast.error(err)
      return
    }
    setUploading(true)
    try {
      setAvatar(await uploadImage(file))
    } catch {
      // 拦截器已提示
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!displayName.trim()) {
      toast.error('请输入姓名')
      return
    }
    if (uploading) return
    setSaving(true)
    try {
      const u = await authApi.updateMe({
        displayName: displayName.trim(),
        avatar: avatar.trim(),
      })
      setUser(u)
      toast.success('个人信息已更新')
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
      title="个人信息"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} disabled={uploading} onClick={() => void submit()}>
            保存
          </Button>
        </>
      }
    >
      <Input label="账号" value={user.username} disabled />
      <Input
        label="姓名"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <div className="mb-3">
        <span className="mb-1.5 block text-meta font-medium text-ink-2">头像</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative shrink-0 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand/40"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={avatar ? '更换头像' : '上传头像'}
          >
            <Avatar name={displayName} src={avatar || null} size={48} />
          </button>
          <input
            id="wiki-profile-avatar-input"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            aria-label={avatar ? '更换头像' : '上传头像'}
            aria-describedby="wiki-profile-avatar-hint"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void pickAvatar(file)
            }}
          />
          <Button size="sm" loading={uploading} aria-busy={uploading} onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            {avatar ? '更换头像' : '上传头像'}
          </Button>
          {avatar ? (
            <Button size="sm" variant="ghost" disabled={uploading} onClick={() => setAvatar('')}>
              移除
            </Button>
          ) : null}
        </div>
        <p id="wiki-profile-avatar-hint" className="mt-1.5 text-meta text-ink-3">
          支持 PNG / JPG / GIF / WebP，最大 5MB
        </p>
      </div>
      <p className="text-meta text-ink-3">角色：{user.role === 1 ? '管理员' : '普通用户'}</p>
    </Dialog>
  )
}

/** 修改密码弹窗 */
function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!oldPwd || !newPwd) {
      toast.error('请填写完整')
      return
    }
    if (newPwd.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword({ oldPassword: oldPwd, newPassword: newPwd })
      toast.success('密码已修改')
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
      title="修改密码"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
        </>
      }
    >
      <Input
        label="当前密码"
        type="password"
        value={oldPwd}
        onChange={(e) => setOldPwd(e.target.value)}
      />
      <Input
        label="新密码"
        type="password"
        placeholder="至少 6 位"
        value={newPwd}
        onChange={(e) => setNewPwd(e.target.value)}
      />
      <Input
        label="确认新密码"
        type="password"
        value={confirmPwd}
        onChange={(e) => setConfirmPwd(e.target.value)}
      />
    </Dialog>
  )
}

/* ==================== 主布局 ==================== */

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  const { spaceId, nodeId: currentNodeId } = useMemo(
    () => parsePath(location.pathname),
    [location.pathname],
  )

  // 空间列表与页面树
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spacesLoaded, setSpacesLoaded] = useState(false)
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // 搜索
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Awaited<ReturnType<typeof wikiApi.search>>>([])
  const [searchOpen, setSearchOpen] = useState(false)

  // 弹窗
  const [spaceManageOpen, setSpaceManageOpen] = useState(false)
  const [memberManageSpaceId, setMemberManageSpaceId] = useState<number | null>(null)
  const [spaceForm, setSpaceForm] = useState<
    { mode: 'create' | 'edit'; space?: Space; prefill?: SpaceFormPrefill } | null
  >(null)
  const [nodeCreate, setNodeCreate] = useState<{ parentId: number | null } | null>(null)
  const [nodeRename, setNodeRename] = useState<TreeNode | null>(null)
  const [nodeDelete, setNodeDelete] = useState<TreeNode | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)

  const currentSpace = useMemo(
    () => spaces.find((s) => s.id === spaceId) ?? null,
    [spaces, spaceId],
  )
  const crumbs = useMemo(
    () => (tree && currentNodeId ? (findPath(tree, currentNodeId) ?? []) : []),
    [tree, currentNodeId],
  )

  const loadSpaces = useCallback(async () => {
    try {
      setSpaces(await wikiApi.listSpaces())
    } catch {
      // 拦截器已提示
    } finally {
      setSpacesLoaded(true)
    }
  }, [])

  const loadTree = useCallback(async (sid: number, silent = false) => {
    if (!silent) setTreeLoading(true)
    try {
      const data = await wikiApi.getTree(sid)
      setTree(data.nodes)
    } catch {
      setTree([])
    } finally {
      if (!silent) setTreeLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  // 进入主布局时刷新一次当前用户信息（角色/姓名可能被管理员修改）
  useEffect(() => {
    authApi
      .getMe()
      .then((u) => useAuthStore.getState().setUser(u))
      .catch(() => {})
  }, [])

  // 切换空间时重新拉取页面树并收起所有节点
  useEffect(() => {
    setTree(null)
    if (spaceId != null) void loadTree(spaceId)
  }, [spaceId, loadTree])

  // 自动展开当前页面的祖先链
  useEffect(() => {
    if (!tree || currentNodeId == null) return
    const path = findPath(tree, currentNodeId)
    if (path && path.length > 1) {
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const n of path.slice(0, -1)) next.add(n.id)
        return next
      })
    }
  }, [tree, currentNodeId])

  // 关联登录新建档案后：引导创建个人专属空间（私有，仅自己可见）
  const onboardedRef = useRef(false)
  useEffect(() => {
    if (onboardedRef.current || !user || !spacesLoaded) return
    if (sessionStorage.getItem(ONBOARD_SPACE_KEY) !== '1') return
    // 只看"我名下的空间"：全站可读空间人人可见，不能据此判断用户已有自己的空间
    if (spaces.some((s) => s.ownerId === user.id) || location.pathname !== '/app') return
    onboardedRef.current = true
    sessionStorage.removeItem(ONBOARD_SPACE_KEY)
    toast.info('欢迎！先创建一个专属工作空间吧，仅自己可见')
    emitOpenSpaceForm({
      name: `${user.displayName || user.username || '我'} 的知识库`,
      visibility: 0,
    })
  }, [user, spacesLoaded, spaces, location.pathname])

  // 事件总线：其他页面请求打开新建空间 / 新建页面弹窗；编辑页改标题后刷新树
  useEffect(() => onOpenSpaceForm((prefill) => setSpaceForm({ mode: 'create', prefill })), [])
  useEffect(() => onOpenNodeCreate((parentId) => setNodeCreate({ parentId })), [])
  useEffect(
    () =>
      onTreeChanged(() => {
        if (spaceId != null) void loadTree(spaceId, true)
      }),
    [spaceId, loadTree],
  )

  // 搜索：输入防抖 + 回车立即搜
  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      setSearching(true)
      wikiApi
        .search(kw)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const runSearchNow = () => {
    const kw = keyword.trim()
    if (!kw) return
    setSearching(true)
    setSearchOpen(true)
    wikiApi
      .search(kw)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }

  // ⌘K / Ctrl+K 聚焦顶栏全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('wiki-global-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 顶栏「新建」：在当前空间建根页面；未选空间时提示
  const handleGlobalCreate = () => {
    if (spaceId == null) {
      toast.info('请先选择一个空间')
      return
    }
    setNodeCreate({ parentId: null })
  }

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------- 节点操作 ---------- */

  const handleCreateNode = async (parentId: number | null, title: string) => {
    if (spaceId == null) return
    const node = await wikiApi.createNode({ spaceId, parentId, title })
    toast.success('页面已创建')
    setNodeCreate(null)
    await loadTree(spaceId)
    if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId))
    navigate(`/app/space/${spaceId}/page/${node.id}`)
  }

  const handleRenameNode = async (node: TreeNode, title: string) => {
    await wikiApi.updateNode(node.id, { title })
    toast.success('已重命名')
    setNodeRename(null)
    if (spaceId != null) await loadTree(spaceId)
    // 当前页重命名后整页跳转一次，触发正文重新拉取
    if (currentNodeId === node.id) navigate(location.pathname, { replace: true })
  }

  const handleDeleteNode = async (node: TreeNode) => {
    // 先基于删除前的树判断是否影响当前浏览路径
    const affected =
      currentNodeId != null && crumbs.some((n) => n.id === node.id)
    await wikiApi.deleteNode(node.id)
    toast.success('页面已删除')
    if (spaceId != null) await loadTree(spaceId)
    if (affected) navigate(`/app/space/${spaceId}`)
  }

  const handleSpaceSubmit = async (values: {
    name: string
    icon: string
    description: string
    visibility: 0 | 1
  }) => {
    const payload = {
      name: values.name.trim(),
      icon: values.icon.trim() || undefined,
      description: values.description.trim() || undefined,
      visibility: values.visibility,
    }
    if (spaceForm?.mode === 'edit' && spaceForm.space) {
      await wikiApi.updateSpace(spaceForm.space.id, payload)
      toast.success('空间已更新')
    } else {
      const s = await wikiApi.createSpace(payload)
      toast.success('空间已创建')
      navigate(`/app/space/${s.id}`)
    }
    setSpaceForm(null)
    await loadSpaces()
  }

  const logout = async () => {
    const rt = useAuthStore.getState().refreshToken
    try {
      if (rt) await authApi.logout(rt)
    } catch {
      // 登出失败也照常清理本地登录态
    }
    useAuthStore.getState().clear()
    navigate('/login', { replace: true })
  }

  /* ---------- 树行操作 ---------- */

  const renderTreeActions = useCallback(
    (node: TreeNode) => (
      <>
        <button
          type="button"
          title="新增子页"
          className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
          onClick={(e) => {
            e.stopPropagation()
            setNodeCreate({ parentId: node.id })
          }}
        >
          <Plus size={14} />
        </button>
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              title="更多操作"
              className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
            >
              <Ellipsis size={14} />
            </button>
          }
        >
          <DropdownItem
            icon={<Pencil size={14} />}
            onClick={() => setNodeRename(node)}
          >
            重命名
          </DropdownItem>
          <DropdownItem
            icon={<Trash2 size={14} />}
            danger
            onClick={() => setNodeDelete(node)}
          >
            删除
          </DropdownItem>
        </Dropdown>
      </>
    ),
    [],
  )

  /* ---------- 渲染 ---------- */

  // 演示模式（URL 带 ?present=1）：隐藏侧栏/顶栏，仅渲染正文区域。
  // 退出由 PageView 负责（右上角按钮 / Esc 清除 query），地址栏回退等参数变化会自动恢复完整布局。
  const isPresentMode = new URLSearchParams(location.search).get('present') === '1'
  if (isPresentMode) {
    return (
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Spinner size={22} />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* ================= 全局顶栏（52px） ================= */}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        {/* 品牌 */}
        <Link to="/app" className="flex shrink-0 items-center gap-2">
          <img src={logoUrl} alt="易飞知识库 Logo" className="h-7 w-7" draggable={false} />
          <span className="text-[15px] font-semibold text-ink-1">易飞知识库</span>
        </Link>
        <span className="h-4 w-px shrink-0 bg-line" aria-hidden />

        {/* 面包屑（空间 / 页面） */}
        <nav className="flex min-w-0 shrink items-center gap-1 text-meta text-ink-3">
          {currentSpace ? (
            <>
              <Link
                to={`/app/space/${currentSpace.id}`}
                className="shrink-0 transition-colors hover:text-brand"
              >
                {currentSpace.name}
              </Link>
              {crumbs.slice(0, -1).map((n) => (
                <Fragment key={n.id}>
                  <span>/</span>
                  <Link
                    to={`/app/space/${spaceId}/page/${n.id}`}
                    className="max-w-[140px] truncate transition-colors hover:text-brand"
                  >
                    {n.title}
                  </Link>
                </Fragment>
              ))}
              {crumbs.length > 0 && (
                <>
                  <span>/</span>
                  <span className="max-w-[220px] truncate font-medium text-ink-1">
                    {crumbs[crumbs.length - 1].title}
                  </span>
                </>
              )}
            </>
          ) : (
            <Link to="/app" className="transition-colors hover:text-brand">
              主页
            </Link>
          )}
        </nav>

        {/* 全局搜索（原侧栏搜索上移；⌘K 聚焦） */}
        <div className="relative mx-auto w-full min-w-[200px] max-w-[420px]">
          <Input
            id="wiki-global-search"
            prefix={<Search size={14} />}
            placeholder="搜索页面…"
            className="h-8 pr-10"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearchNow()
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1 text-[11px] leading-4 text-ink-3">
            ⌘K
          </span>
          {searchOpen && keyword.trim() && (
            <div className="absolute left-0 right-0 top-9 z-50 max-h-80 overflow-y-auto rounded-pop border border-line bg-surface p-1 shadow-3">
              {searching && (
                <div className="flex items-center gap-2 px-3 py-2 text-meta text-ink-3">
                  <Spinner size={13} /> 搜索中…
                </div>
              )}
              {!searching && results.length === 0 && (
                <p className="px-3 py-2 text-meta text-ink-3">未找到相关页面</p>
              )}
              {results.map((r) => (
                <button
                  key={r.nodeId}
                  type="button"
                  className="flex w-full flex-col items-start rounded-ctrl px-3 py-1.5 text-left transition-colors hover:bg-sunken"
                  onClick={() => {
                    setKeyword('')
                    setResults([])
                    navigate(`/app/space/${r.spaceId}/page/${r.nodeId}`)
                  }}
                >
                  <span className="w-full truncate text-sm text-ink-1">{r.title}</span>
                  {r.spaceName && (
                    <span className="text-meta text-ink-3">位于：{r.spaceName}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 子页面操作按钮挂载点（如文档页的导出/演示/编辑等） */}
        <div id="wiki-page-actions" className="flex shrink-0 items-center gap-1.5" />

        {/* 通知铃铛（未读红点 + 下拉列表） */}
        <NotificationBell />

        {/* 新建 */}
        <Button
          size="sm"
          variant="primary"
          className="shrink-0"
          onClick={handleGlobalCreate}
        >
          <Plus size={14} /> 新建
        </Button>

        {/* 用户下拉 */}
        <Dropdown
          align="right"
          menuClassName="w-44"
          trigger={
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-ctrl px-1.5 py-1 transition-colors hover:bg-sunken"
            >
              <Avatar name={user?.displayName ?? '?'} src={user?.avatar} size={28} />
              <span className="max-w-[96px] truncate text-sm text-ink-2">
                {user?.displayName ?? '未登录'}
              </span>
            </button>
          }
        >
          <div className="border-b border-line px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink-1">
              {user?.displayName}
            </p>
            <p className="truncate text-meta text-ink-3">@{user?.username}</p>
          </div>
          <DropdownItem icon={<User size={15} />} onClick={() => setProfileOpen(true)}>
            个人信息
          </DropdownItem>
          <DropdownItem icon={<KeyRound size={15} />} onClick={() => setPwdOpen(true)}>
            修改密码
          </DropdownItem>
          {user?.role === 1 && (
            <>
              <DropdownItem
                icon={<ShieldCheck size={15} />}
                onClick={() => navigate('/admin/users')}
              >
                管理后台
              </DropdownItem>
              <DropdownItem
                icon={<Users size={15} />}
                onClick={() => navigate('/admin/groups')}
              >
                用户组
              </DropdownItem>
              <DropdownItem
                icon={<ScrollText size={15} />}
                onClick={() => navigate('/admin/operations')}
              >
                审计日志
              </DropdownItem>
              <DropdownItem
                icon={<FileBadge size={15} />}
                onClick={() => navigate('/admin/license')}
              >
                License 授权
              </DropdownItem>
              <DropdownItem
                icon={<Webhook size={15} />}
                onClick={() => navigate('/admin/webhooks')}
              >
                Webhook 订阅
              </DropdownItem>
              <DropdownItem
                icon={<FileKey size={15} />}
                onClick={() => navigate('/admin/apikeys')}
              >
                开放 API 密钥
              </DropdownItem>
            </>
          )}
          <DropdownDivider />
          <DropdownItem icon={<LogOut size={15} />} danger onClick={() => void logout()}>
            退出登录
          </DropdownItem>
        </Dropdown>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ================= 侧栏（264px） ================= */}
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-surface">
          {/* 空间卡：头像 + 名称 + 角色 chip + 成员数；点击切换空间 */}
          <div className="p-3 pb-1.5">
            <Dropdown
              align="left"
              menuClassName="w-[240px]"
              trigger={
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-card border border-line bg-surface p-2.5 text-left transition-colors hover:bg-sunken"
                >
                  {currentSpace ? (
                    <SpaceBadge space={currentSpace} size={32} />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-brand text-white">
                      <BookOpen size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink-1">
                        {currentSpace ? currentSpace.name : '选择空间'}
                      </span>
                      {currentSpace && (
                        <span className="shrink-0 rounded bg-brand-light px-1 py-px text-[11px] font-medium text-brand">
                          {SPACE_ROLE_NAMES[currentSpace.role]}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-meta text-ink-3">
                      {currentSpace
                        ? `${currentSpace.memberCount} 名成员${
                            currentSpace.description ? ` · ${currentSpace.description}` : ''
                          }`
                        : '切换或创建空间'}
                    </span>
                  </span>
                  <ChevronsUpDown size={14} className="shrink-0 text-ink-3" />
                </button>
              }
            >
              <div className="max-h-64 overflow-y-auto">
                {spaces.map((s) => (
                  <DropdownItem
                    key={s.id}
                    active={s.id === spaceId}
                    onClick={() => navigate(`/app/space/${s.id}`)}
                  >
                    <span className="mr-1">{s.icon || '📘'}</span>
                    {s.name}
                  </DropdownItem>
                ))}
                {spacesLoaded && spaces.length === 0 && (
                  <p className="px-3 py-2 text-meta text-ink-3">暂无空间</p>
                )}
              </div>
              <DropdownDivider />
              <DropdownItem
                icon={<Settings size={15} />}
                onClick={() => setSpaceManageOpen(true)}
              >
                空间管理
              </DropdownItem>
            </Dropdown>
          </div>

          {/* 主导航 */}
          <nav className="px-3 pt-1.5">
            <SidebarLink
              to="/app"
              icon={<House size={16} />}
              label="主页"
              active={location.pathname === '/app'}
            />
            <SidebarLink
              to="/app/favorites"
              icon={<Star size={16} />}
              label="我的收藏"
              active={location.pathname === '/app/favorites'}
            />
            <SidebarLink
              to="/app/drafts"
              icon={<FileEdit size={16} />}
              label="我的草稿箱"
              active={location.pathname === '/app/drafts'}
            />
            <SidebarLink
              to="/app/templates"
              icon={<LayoutTemplate size={16} />}
              label="页面模板"
              active={location.pathname === '/app/templates'}
            />
          </nav>

          {/* 页面树 */}
          <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-line pt-2">
            <div className="flex items-center justify-between px-4 pb-1">
              <span className="text-meta font-medium text-ink-3">页面树</span>
              <span className="flex items-center gap-1">
                {spaceId != null && (
                  <>
                    <button
                      type="button"
                      title="数据统计"
                      className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
                      onClick={() => navigate(`/app/space/${spaceId}/stats`)}
                    >
                      <BarChart3 size={14} />
                    </button>
                    <button
                      type="button"
                      title="回收站"
                      className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
                      onClick={() => navigate(`/app/space/${spaceId}/trash`)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  title="新建根页面"
                  className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
                  onClick={() => {
                    if (spaceId == null) {
                      toast.info('请先选择一个空间')
                      return
                    }
                    setNodeCreate({ parentId: null })
                  }}
                >
                  <Plus size={15} />
                </button>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {spaceId == null && (
                <p className="px-3 py-6 text-center text-meta text-ink-3">
                  从上方选择一个空间
                </p>
              )}
              {spaceId != null && treeLoading && (
                <div className="flex justify-center py-6">
                  <Spinner size={18} />
                </div>
              )}
              {spaceId != null && !treeLoading && tree && tree.length === 0 && (
                <p className="px-3 py-6 text-center text-meta text-ink-3">
                  空间内还没有页面，点击右上 + 新建
                </p>
              )}
              {spaceId != null && tree && tree.length > 0 && (
                <Tree
                  nodes={tree}
                  currentNodeId={currentNodeId}
                  expandedIds={expanded}
                  onToggle={toggleExpand}
                  onSelect={(n) => navigate(`/app/space/${spaceId}/page/${n.id}`)}
                  renderActions={renderTreeActions}
                />
              )}
            </div>
          </div>
        </aside>

        {/* ================= 主区内容（列表页灰底、页面自绘卡片；阅读/编辑页自绘白画布） ================= */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center">
                <Spinner size={22} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* ================= 弹窗群 ================= */}
      <Dialog
        open={spaceManageOpen}
        title="空间管理"
        width={560}
        onClose={() => setSpaceManageOpen(false)}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-meta text-ink-3">共 {spaces.length} 个空间</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setSpaceForm({ mode: 'create' })}
          >
            <Plus size={14} /> 新建空间
          </Button>
        </div>
        <div className="max-h-[360px] divide-y divide-line overflow-y-auto">
          {spaces.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <SpaceBadge space={s} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-1">{s.name}</p>
                <p className="text-meta text-ink-3">
                  {s.visibility === 0 ? '私有' : '登录可读'} · {s.memberCount} 名成员 ·
                  我的角色：{SPACE_ROLE_NAMES[s.role]}
                </p>
              </div>
              {(s.role === 1 || user?.role === 1) && (
                <Button size="sm" onClick={() => setMemberManageSpaceId(s.id)}>
                  成员
                </Button>
              )}
              <Button size="sm" onClick={() => setSpaceForm({ mode: 'edit', space: s })}>
                编辑
              </Button>
            </div>
          ))}
          {spacesLoaded && spaces.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-3">
              还没有空间，点击右上角新建
            </p>
          )}
        </div>
      </Dialog>

      {memberManageSpaceId !== null && (
        <MemberManageDialog
          spaceId={memberManageSpaceId}
          open
          onClose={() => setMemberManageSpaceId(null)}
        />
      )}

      {spaceForm && (
        <SpaceFormDialog
          mode={spaceForm.mode}
          space={spaceForm.space}
          prefill={spaceForm.prefill}
          onClose={() => setSpaceForm(null)}
          onSubmit={handleSpaceSubmit}
        />
      )}

      {nodeCreate && (
        <TitleDialog
          title={nodeCreate.parentId == null ? '新建根页面' : '新建子页面'}
          label="页面标题"
          onClose={() => setNodeCreate(null)}
          onSubmit={(t) => handleCreateNode(nodeCreate.parentId, t)}
        />
      )}

      {nodeRename && (
        <TitleDialog
          title="重命名页面"
          label="页面标题"
          initial={nodeRename.title}
          onClose={() => setNodeRename(null)}
          onSubmit={(t) => handleRenameNode(nodeRename, t)}
        />
      )}

      {nodeDelete && (
        <ConfirmDialogDelete
          title={nodeDelete.title}
          hasChildren={nodeDelete.children.length > 0}
          onClose={() => setNodeDelete(null)}
          onConfirm={() => handleDeleteNode(nodeDelete)}
        />
      )}

      {profileOpen && user && (
        <ProfileDialog user={user} onClose={() => setProfileOpen(false)} />
      )}
      {pwdOpen && <PasswordDialog onClose={() => setPwdOpen(false)} />}
    </div>
  )
}

/** 删除页面确认弹窗（包一层以便使用 ConfirmDialog 的确认文案逻辑） */
function ConfirmDialogDelete({
  title,
  hasChildren,
  onClose,
  onConfirm,
}: {
  title: string
  hasChildren: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  return (
    <ConfirmDialog
      open
      title="删除页面"
      danger
      confirmText="删除"
      onClose={onClose}
      onConfirm={onConfirm}
      content={
        <>
          确定删除「<span className="font-medium text-ink-1">{title}</span>」吗？
          {hasChildren && (
            <span className="mt-1 block text-meta text-ink-3">
              其子页面将一并删除（可在回收站恢复，本阶段暂未提供回收站界面）。
            </span>
          )}
        </>
      }
    />
  )
}
