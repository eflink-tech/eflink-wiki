import { request } from './client'
import type { PageResult, UserInfo } from './types'

/** 分页查询用户列表（keyword 匹配用户名/姓名） */
export const listUsers = (params: {
  keyword?: string
  page?: number
  size?: number
}) => request<PageResult<UserInfo>>({ url: '/admin/users', method: 'GET', params })

/** 创建用户 */
export const createUser = (data: {
  username: string
  displayName: string
  password: string
  role: 1 | 2
}) => request<UserInfo>({ url: '/admin/users', method: 'POST', data })

/** 更新用户（姓名/角色/状态/重置密码） */
export const updateUser = (
  id: number,
  data: { displayName?: string; role?: 1 | 2; status?: 1 | 2; password?: string },
) => request<UserInfo>({ url: `/admin/users/${id}`, method: 'PUT', data })

/** Excel 批量导入用户（xlsx/csv；返回创建数/跳过数/逐行错误） */
export const importUsers = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<{ created: number; skipped: number; errors: string[] }>({
    url: '/admin/users/import',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 审计日志项 */
export interface OperationLog {
  id: number
  userId: number
  username: string
  action: string
  targetType: string | null
  targetId: string | null
  detail: string | null
  ip: string | null
  createdAt: number | null
}

/** 审计日志分页查询 */
export const listOperations = (params: {
  action?: string
  userId?: number
  page?: number
  size?: number
}) => request<PageResult<OperationLog>>({ url: '/admin/operations', method: 'GET', params })

/* ---------- 用户组管理 ---------- */

export interface UserGroupItem {
  id: number
  name: string
  description: string | null
  source: 1 | 2 // 1 手动创建 2 LDAP 同步
  externalDn: string | null
  memberCount: number
  spaceCount: number
  createdAt: number | null
}

/** 组分页列表（keyword 匹配组名/描述） */
export const listGroups = (params: { keyword?: string; page?: number; size?: number }) =>
  request<PageResult<UserGroupItem>>({ url: '/admin/user-groups', method: 'GET', params })

export const createGroup = (data: { name: string; description?: string }) =>
  request<UserGroupItem>({ url: '/admin/user-groups', method: 'POST', data })

export const updateGroup = (id: number, data: { name: string; description?: string }) =>
  request<UserGroupItem>({ url: `/admin/user-groups/${id}`, method: 'PUT', data })

/** 删除组（同时清理组成员关系与空间授权） */
export const deleteGroup = (id: number) =>
  request<null>({ url: `/admin/user-groups/${id}`, method: 'DELETE' })

export interface GroupMemberItem {
  id: number
  userId: number
  username: string
  displayName: string
  avatar: string | null
  createdAt: number | null
}

export const listGroupMembers = (id: number) =>
  request<{ list: GroupMemberItem[] }>({ url: `/admin/user-groups/${id}/members`, method: 'GET' })

export const addGroupMember = (id: number, data: { userId: number }) =>
  request<GroupMemberItem>({ url: `/admin/user-groups/${id}/members`, method: 'POST', data })

export const removeGroupMember = (id: number, memberId: number) =>
  request<null>({ url: `/admin/user-groups/${id}/members/${memberId}`, method: 'DELETE' })

