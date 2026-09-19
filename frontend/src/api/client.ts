import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { toast } from '../components/Toast'
import { useAuthStore } from '../store/authStore'
import type { Envelope } from './types'

// 扩展 axios 配置项：_retried 标记重放、_silent 静默（不弹全局提示）
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 该请求是否已因 401 刷新后重放过 */
    _retried?: boolean
    /** 静默模式：业务错误不弹全局 toast，由页面自行展示 */
    _silent?: boolean
  }
}

/** 业务错误：携带后端返回的 message 与状态码 */
export class ApiError extends Error {
  code: number
  constructor(message: string, code = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** 无需登录态（或 401 时不应触发刷新）的路径 */
const AUTH_FREE_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/captcha',
  '/setup',
]

/** 独立部署时可设 VITE_API_BASE（如 http://wiki-api.example.com/api）；同域 nginx 反代则保持 /api */
export const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

const http = axios.create({ baseURL: API_BASE, timeout: 15000 })

// 请求拦截：附加 accessToken
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** 进行中的刷新请求（并发 401 共用同一次刷新） */
let refreshing: Promise<boolean> | null = null

/** 用 refreshToken 换新 token（走独立的裸 axios，避免被本实例拦截器递归处理） */
async function doRefresh(): Promise<boolean> {
  const { refreshToken, setTokens } = useAuthStore.getState()
  if (!refreshToken) return false
  try {
    const res = await axios.post<
      Envelope<{ accessToken: string; refreshToken: string }>
    >(`${API_BASE}/auth/refresh`, { refreshToken })
    if (res.data?.status === 0 && res.data.data) {
      setTokens(res.data.data)
      return true
    }
    return false
  } catch {
    return false
  }
}

/** 清空登录态并跳转登录页（整页跳转，避免残留内存状态） */
function gotoLogin(): void {
  useAuthStore.getState().clear()
  const path = window.location.pathname
  if (!path.startsWith('/login') && !path.startsWith('/setup')) {
    window.location.assign('/login')
  }
}

http.interceptors.response.use(
  (response) => {
    // 统一解包响应信封：{ timestamp, status, data, error, message, path }
    const body = response.data as Envelope | undefined
    if (body && typeof body === 'object' && 'status' in body) {
      if (body.status === 0) return body.data as AxiosResponse
      const msg = body.message || '操作失败'
      if (!response.config._silent) toast.error(msg)
      return Promise.reject(new ApiError(msg, body.status))
    }
    return response
  },
  async (error: AxiosError) => {
    const { response, config } = error
    const url = config?.url ?? ''
    const authFree = AUTH_FREE_PATHS.some((p) => url.includes(p))

    // HTTP 401 表示 token 失效：用 refreshToken 换新 token 后重放一次
    if (response?.status === 401 && config && !config._retried && !authFree) {
      refreshing ??= doRefresh().finally(() => {
        refreshing = null
      })
      const ok = await refreshing
      if (ok) {
        config._retried = true
        const token = useAuthStore.getState().accessToken
        config.headers.Authorization = `Bearer ${token}`
        return http(config)
      }
      // 刷新失败：登出并跳转登录页
      gotoLogin()
    }

    const msg =
      (response?.data as Envelope | undefined)?.message ||
      error.message ||
      '网络异常，请稍后重试'
    if (!config?._silent) toast.error(msg)
    return Promise.reject(new ApiError(msg, response?.status ?? 0))
  },
)

/**
 * 发起请求（响应拦截器已解包信封，直接返回业务 data）。
 * 业务失败 / HTTP 错误时抛出 ApiError。
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  // 运行时返回的已是解包后的业务数据，这里直接断言为业务类型
  return (await http.request(config)) as unknown as T
}
