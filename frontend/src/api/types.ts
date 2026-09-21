/** 与后端约定的统一响应信封：status === 0 表示成功 */
export interface Envelope<T = unknown> {
  timestamp: string
  status: number
  data: T
  error?: string | null
  message?: string | null
  path?: string
}

/** 当前用户信息（role: 1=管理员 2=普通用户） */
export interface UserInfo {
  id: number
  username: string
  displayName: string
  avatar?: string | null
  role: 1 | 2
  status?: 1 | 2 // 1=正常 2=禁用（管理后台接口返回）
  createdAt?: string
}

/** 登录 / 初始化接口返回的认证信息 */
export interface LoginResult {
  user: UserInfo
  accessToken: string
  refreshToken: string
}

/** 公开配置（登录页/初始化页展示用） */
export interface PublicConfig {
  productName: string
  logoUrl?: string | null
  version: string
  captchaEnabled: boolean
  /** 全屏编辑器是否显示包自带返回按钮（业务系统集成可控） */
  embedBackShow: boolean
  /** 返回按钮目标地址；空 = 返回知识库页面本身 */
  embedBackHref: string
  /** （兼容保留）是否展示 eflink 主站关联登录入口 */
  eflinkLoginEnabled?: boolean
  /** 外部系统关联登录通道（登录页据此渲染按钮；后端只下发 loginButton=true 且有文案的） */
  connectors?: ConnectorInfo[]
}

/** 外部系统关联登录通道 */
export interface ConnectorInfo {
  /** 外部系统标识（user.provider），如 eflink、becbas */
  provider: string
  /** 登录页按钮文案 */
  label: string
}

/** 外部系统关联登录：发起结果（防 CSRF state + 对方系统中转页地址） */
export interface ConnectorStartInfo {
  state: string
  authorizeUrl: string
}

/** 外部系统关联登录：票据兑换 / 冲突授权结果 */
export interface ConnectorLoginResult {
  status: 'ok' | 'conflict'
  auth?: LoginResult | null
  bindTicket?: string | null
  conflictUsername?: string | null
  /** 本次登录完成了新用户建档：据此引导创建个人专属空间 */
  created?: boolean
}

/** 系统初始化状态 */
export interface SetupStatus {
  initialized: boolean
}

/** 图形验证码（image 为 data:image/png;base64,xxx） */
export interface CaptchaInfo {
  captchaId: string
  image: string
}

/** 空间（visibility: 0=私有 1=登录可读；role: 1=管理员 2=编辑者 3=查看者） */
export interface Space {
  id: number
  name: string
  icon?: string | null
  description?: string | null
  visibility: 0 | 1
  ownerId: number
  ownerName?: string
  role: 1 | 2 | 3
  memberCount: number
  createdAt?: string
}

/** 页面树节点（children 由后端整树返回） */
export interface TreeNode {
  id: number
  parentId: number | null
  title: string
  sort: number
  currentVersionId: number | null
  updatedAt: string | null
  children: TreeNode[]
}

/** 空间页面树 */
export interface TreeData {
  spaceId: number
  nodes: TreeNode[]
}

/** 页面阅读数据（content 为可空的 JSON 字符串） */
export interface NodePage {
  nodeId: number
  title: string
  content: string | null
  versionNo: number | null
  publishedAt: string | null
  viewCount: number
}

/** 页面草稿 */
export interface NodeDraft {
  nodeId: number
  content: string | null
  baseVersionId: number
  updatedAt: string
  currentVersionNo: number
}

/** 收藏条目 */
export interface FavoriteItem {
  nodeId: number
  spaceId: number
  title: string
  createdAt: string
}

/** 最近打开条目 */
export interface RecentOpenItem {
  nodeId: number
  spaceId: number
  title: string
  spaceName: string
  openedAt: string
}

/** 全文搜索结果条目 */
export interface SearchResultItem {
  nodeId: number
  spaceId: number
  title: string
  spaceName?: string | null
}

/** 分页查询结果（管理后台用户列表） */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}
