import { request } from './client'
import type {
  FavoriteItem,
  NodeDraft,
  NodePage,
  RecentOpenItem,
  SearchResultItem,
  Space,
  TreeData,
  TreeNode,
} from './types'

/* ---------------- 空间 ---------------- */

/** 后端空间角色字段名为 myRole，前端统一映射为 role（历史缺陷修复） */
function withRole(s: Space & { myRole?: number }): Space {
  return { ...s, role: (s.myRole ?? s.role) as Space['role'] }
}

/** 空间列表（后端统一返回 { list } 信封，这里解包为数组） */
export async function listSpaces(): Promise<Space[]> {
  const res = await request<Space[] | { list?: Space[] }>({ url: '/wiki/spaces', method: 'GET' })
  const list = Array.isArray(res) ? res : (res.list ?? [])
  return list.map(withRole)
}

export const createSpace = (data: {
  name: string
  icon?: string
  description?: string
  visibility?: 0 | 1
}) =>
  request<Space & { myRole?: number }>({ url: '/wiki/spaces', method: 'POST', data }).then(
    withRole,
  )

export const updateSpace = (
  id: number,
  data: { name?: string; icon?: string; description?: string; visibility?: 0 | 1 },
) =>
  request<Space & { myRole?: number }>({ url: `/wiki/spaces/${id}`, method: 'PUT', data }).then(
    withRole,
  )

/* ---------------- 页面树 / 节点 ---------------- */

/** 获取空间整棵页面树 */
export const getTree = (spaceId: number) =>
  request<TreeData>({ url: `/wiki/spaces/${spaceId}/tree`, method: 'GET' })

export const createNode = (data: {
  spaceId: number
  parentId: number | null
  title: string
  templateId?: number | null
}) => request<TreeNode>({ url: '/wiki/nodes', method: 'POST', data })

export const updateNode = (
  id: number,
  data: { title?: string; parentId?: number; sort?: number },
) => request<TreeNode>({ url: `/wiki/nodes/${id}`, method: 'PUT', data })

/** 删除节点（purge=false 时进入回收站） */
export const deleteNode = (id: number, purge = false) =>
  request<null>({
    url: `/wiki/nodes/${id}`,
    method: 'DELETE',
    params: { purge },
  })

/* ---------------- 页面内容（编辑器接入前仅读取/发布/草稿） ---------------- */

export const getPage = (id: number) =>
  request<NodePage>({ url: `/wiki/nodes/${id}/page`, method: 'GET' })

export const getDraft = (id: number) =>
  request<NodeDraft>({ url: `/wiki/nodes/${id}/draft`, method: 'GET' })

export const saveDraft = (id: number, data: { content: string; baseVersionId?: number }) =>
  request<{ updatedAt: string }>({
    url: `/wiki/nodes/${id}/draft`,
    method: 'PUT',
    data,
  })

export const publish = (id: number, data: { title?: string } = {}) =>
  request<{ versionNo: number }>({
    url: `/wiki/nodes/${id}/publish`,
    method: 'POST',
    data,
  })

/* ---------------- 收藏 ---------------- */

/** 我的收藏列表（解包 { list } 信封） */
export async function listFavorites(): Promise<FavoriteItem[]> {
  const res = await request<FavoriteItem[] | { list?: FavoriteItem[] }>({
    url: '/wiki/favorites',
    method: 'GET',
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/** 切换收藏状态 */
export const toggleFavorite = (nodeId: number) =>
  request<{ favorited: boolean }>({
    url: '/wiki/favorites',
    method: 'POST',
    data: { nodeId },
  })

/* ---------------- 最近打开 ---------------- */

/** 我的最近打开页面列表（解包 { list } 信封） */
export async function listRecentOpens(): Promise<RecentOpenItem[]> {
  const res = await request<RecentOpenItem[] | { list?: RecentOpenItem[] }>({
    url: '/wiki/recent-opens',
    method: 'GET',
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/** 记录页面打开（fire-and-forget，失败静默） */
export const recordRecentOpen = (nodeId: number) =>
  request({
    url: '/wiki/recent-opens',
    method: 'POST',
    data: { nodeId },
  }).catch(() => {})

/* ---------------- 全局搜索 ---------------- */

/**
 * 全文搜索（下拉结果，点击跳转对应页面）。
 * 兼容直接返回数组或 { list: [...] } 两种形态；静默失败不打扰输入。
 */
export async function search(keyword: string): Promise<SearchResultItem[]> {
  const res = await request<SearchResultItem[] | { list?: SearchResultItem[] }>({
    url: '/wiki/search',
    method: 'GET',
    params: { q: keyword },
    _silent: true,
  })
  if (Array.isArray(res)) return res
  return res.list ?? []
}

/* ==================== P1：评论 / 版本 / 统计 / 模板 / 成员 / 回收站 / 草稿箱 ==================== */

/* ---------- 评论 ---------- */

export interface CommentItem {
  id: number
  nodeId: number
  parentId: number
  content: string
  userId: number
  username: string
  displayName: string
  avatar: string | null
  createdAt: number | null
}

export const listComments = (nodeId: number) =>
  request<{ list: CommentItem[] }>({ url: `/wiki/nodes/${nodeId}/comments`, method: 'GET' })

export const addComment = (nodeId: number, data: { content: string; parentId?: number; mentionUserIds?: number[] }) =>
  request<CommentItem>({ url: `/wiki/nodes/${nodeId}/comments`, method: 'POST', data })

export const deleteComment = (commentId: number) =>
  request<null>({ url: `/wiki/comments/${commentId}`, method: 'DELETE' })

/* ---------- 版本 ---------- */

export interface VersionItem {
  versionNo: number
  title: string
  publishedByName: string | null
  publishedAt: number | null
}

export const listVersions = (nodeId: number) =>
  request<{ list: VersionItem[] }>({ url: `/wiki/nodes/${nodeId}/versions`, method: 'GET' })

export const getVersion = (nodeId: number, versionNo: number) =>
  request<{ versionNo: number; title: string; content: string | null; publishedByName: string | null; publishedAt: number | null }>({
    url: `/wiki/nodes/${nodeId}/versions/${versionNo}`,
    method: 'GET',
  })

/** 回滚：把版本快照写入我的草稿 */
export const restoreVersion = (nodeId: number, versionNo: number) =>
  request<NodeDraft>({ url: `/wiki/nodes/${nodeId}/versions/${versionNo}/restore`, method: 'POST' })

/** 放弃我的草稿（放弃未发布修改） */
export const deleteDraft = (nodeId: number) =>
  request<null>({ url: `/wiki/nodes/${nodeId}/draft`, method: 'DELETE' })

/* ---------- 嵌入块数据（word/excel/pptx/draw/mindmap） ---------- */

export interface EmbedData {
  nodeId: number
  embedId: string
  type: string
  title: string
  content: string | null
  updatedAt: number | null
}

export const getEmbedData = (nodeId: number, embedId: string) =>
  request<EmbedData>({ url: `/wiki/nodes/${nodeId}/embeds/${embedId}`, method: 'GET' })

export const saveEmbedData = (
  nodeId: number,
  embedId: string,
  data: { type: string; title: string; content?: string | null },
) => request<EmbedData>({ url: `/wiki/nodes/${nodeId}/embeds/${embedId}`, method: 'PUT', data })

/* ---------- 数据统计 ---------- */

export interface SpaceStats {
  nodeCount: number
  memberCount?: number
  totalViews: number
  versionCount: number
  dailyViews: { date: string; views: number }[]
  contributors: { userId: number; displayName: string; publishes: number; views: number }[]
  recentNodes: { id: number; title: string; updatedAt: number | null }[]
}

export const getSpaceStats = (spaceId: number) =>
  request<SpaceStats>({ url: `/wiki/spaces/${spaceId}/stats`, method: 'GET' })

/* ---------- 模板 ---------- */

export interface TemplateItem {
  id: number
  title: string
  description: string | null
  createdByName: string | null
  createdAt: number | null
}

export const listTemplates = () =>
  request<{ list: TemplateItem[] }>({ url: '/wiki/templates', method: 'GET' })

export const getTemplate = (id: number) =>
  request<{ id: number; title: string; description: string | null; content: string | null }>({
    url: `/wiki/templates/${id}`,
    method: 'GET',
  })

export const saveAsTemplate = (nodeId: number, data: { title: string; description?: string }) =>
  request<TemplateItem>({ url: `/wiki/nodes/${nodeId}/save-as-template`, method: 'POST', data })

export const deleteTemplate = (id: number) =>
  request<null>({ url: `/wiki/templates/${id}`, method: 'DELETE' })

/* ---------- 成员管理 ---------- */

export interface MemberItem {
  id: number
  userId: number
  username: string
  displayName: string
  avatar: string | null
  role: number // 1 admin 2 editor 3 viewer
}

export const listMembers = (spaceId: number) =>
  request<{ list: MemberItem[] }>({ url: `/wiki/spaces/${spaceId}/members`, method: 'GET' })

export const addMember = (spaceId: number, data: { userId: number; role: number }) =>
  request<MemberItem>({ url: `/wiki/spaces/${spaceId}/members`, method: 'POST', data })

export const updateMember = (spaceId: number, memberId: number, data: { role: number }) =>
  request<MemberItem>({ url: `/wiki/spaces/${spaceId}/members/${memberId}`, method: 'PUT', data })

export const removeMember = (spaceId: number, memberId: number) =>
  request<null>({ url: `/wiki/spaces/${spaceId}/members/${memberId}`, method: 'DELETE' })

/* ---------- 用户组与按组授权 ---------- */

/** 用户精简信息（登录即可搜索，不含邮箱等敏感字段） */
export interface UserBrief {
  id: number
  username: string
  displayName: string
  avatar: string | null
}

export const searchUsers = (keyword: string) =>
  request<{ list: UserBrief[] }>({ url: '/wiki/users', method: 'GET', params: { keyword } })

export interface UserGroupOption {
  id: number
  name: string
  description: string | null
  groupSource: 1 | 2 // 1 手动创建 2 LDAP 同步
  memberCount: number
}

/** 全部用户组（授权下拉选择用） */
export const listGroupOptions = () =>
  request<{ list: UserGroupOption[] }>({ url: '/wiki/groups', method: 'GET' })

export interface SpaceGroupItem {
  id: number // 授权关系ID
  groupId: number
  groupName: string
  groupSource: 1 | 2
  memberCount: number
  role: number // 1 admin 2 editor 3 viewer
}

export const listSpaceGroups = (spaceId: number) =>
  request<{ list: SpaceGroupItem[] }>({ url: `/wiki/spaces/${spaceId}/groups`, method: 'GET' })

export const addSpaceGroup = (spaceId: number, data: { groupId: number; role: number }) =>
  request<SpaceGroupItem>({ url: `/wiki/spaces/${spaceId}/groups`, method: 'POST', data })

export const updateSpaceGroup = (spaceId: number, grantId: number, data: { role: number }) =>
  request<null>({ url: `/wiki/spaces/${spaceId}/groups/${grantId}`, method: 'PUT', data })

export const removeSpaceGroup = (spaceId: number, grantId: number) =>
  request<null>({ url: `/wiki/spaces/${spaceId}/groups/${grantId}`, method: 'DELETE' })

/* ---------- 回收站 ---------- */

export interface TrashNode {
  id: number
  parentId: number
  title: string
  deletedAt: number | null
}

export const listTrash = (spaceId: number) =>
  request<{ list: TrashNode[] }>({ url: `/wiki/nodes/recycle/${spaceId}`, method: 'GET' })

export const restoreNode = (nodeId: number) =>
  request<null>({ url: `/wiki/nodes/${nodeId}/restore`, method: 'POST' })

/* ---------- 我的草稿箱 ---------- */

export interface DraftListItem {
  nodeId: number
  spaceId: number
  spaceName: string
  title: string
  updatedAt: number | null
}

export const listMyDrafts = () =>
  request<{ list: DraftListItem[] }>({ url: '/wiki/drafts', method: 'GET' })

/* ---------- 站内通知 ---------- */

export interface NotificationItem {
  id: number
  /** 1 页面被评论 2 评论被回复 3 被@提及 */
  type: number
  title: string
  spaceId: number
  nodeId: number
  commentId: number
  isRead: boolean
  createdAt: number | null
}

export const listNotifications = (page = 1, size = 20) =>
  request<{ list: NotificationItem[]; unread: number; hasMore: boolean }>({
    url: '/wiki/notifications',
    method: 'GET',
    params: { page, size },
  })

export const markNotificationsRead = (data: { ids?: number[]; all?: boolean }) =>
  request<null>({ url: '/wiki/notifications/read', method: 'POST', data })
