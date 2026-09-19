import { request } from './client'
import type {
  CaptchaInfo,
  LoginResult,
  PublicConfig,
  SetupStatus,
  UserInfo,
} from './types'

/** 公开配置（登录页 / 初始化页展示产品名等） */
export const getPublicConfig = () =>
  request<PublicConfig>({ url: '/public/config', method: 'GET' })

/** 系统初始化状态 */
export const getSetupStatus = () =>
  request<SetupStatus>({ url: '/setup/status', method: 'GET' })

/** 首次初始化：创建管理员并自动登录 */
export const setup = (data: {
  username: string
  password: string
  displayName: string
}) => request<LoginResult>({ url: '/setup', method: 'POST', data, _silent: true })

/** 获取图形验证码（仅 captchaEnabled 时使用） */
export const getCaptcha = () =>
  request<CaptchaInfo>({ url: '/auth/captcha', method: 'GET' })

/** 账号密码登录（可选验证码） */
export const login = (data: {
  username: string
  password: string
  captchaId?: string
  captchaCode?: string
}) =>
  request<LoginResult>({ url: '/auth/login', method: 'POST', data, _silent: true })

/** 退出登录（服务端吊销 refreshToken） */
export const logout = (refreshToken: string) =>
  request<null>({ url: '/auth/logout', method: 'POST', data: { refreshToken } })

/** 修改当前用户密码 */
export const changePassword = (data: { oldPassword: string; newPassword: string }) =>
  request<null>({ url: '/auth/change-password', method: 'POST', data })

/** 当前用户信息 */
export const getMe = () => request<UserInfo>({ url: '/user/me', method: 'GET' })

/** 更新当前用户信息（姓名 / 头像 / 密码） */
export const updateMe = (data: {
  displayName?: string
  avatar?: string
  password?: string
}) => request<UserInfo>({ url: '/user/me', method: 'PUT', data })
