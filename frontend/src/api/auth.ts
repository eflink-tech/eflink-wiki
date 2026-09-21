import { request } from './client'
import type {
  CaptchaInfo,
  ConnectorLoginResult,
  ConnectorStartInfo,
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

/** 发起外部系统关联登录：拿对方系统中转页地址与 state（provider 缺省 eflink） */
export const connectorStart = (provider = 'eflink') =>
  request<ConnectorStartInfo>({
    url: `/auth/connector/start?provider=${encodeURIComponent(provider)}`,
    method: 'GET',
  })

/** 对方系统回跳后凭一次性票据换取登录态（撞名时返回 conflict） */
export const connectorLogin = (data: { provider?: string; ticket: string; state: string }) =>
  request<ConnectorLoginResult>({ url: '/auth/connector/login', method: 'POST', data, _silent: true })

/** 撞名冲突：输入本地账号密码完成授权绑定并登录 */
export const connectorBind = (data: { bindTicket: string; password: string }) =>
  request<ConnectorLoginResult>({ url: '/auth/connector/bind', method: 'POST', data, _silent: true })

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
