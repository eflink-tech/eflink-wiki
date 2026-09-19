import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LoginResult, UserInfo } from '../api/types'

/** token 对 */
interface Tokens {
  accessToken: string
  refreshToken: string
}

interface AuthState {
  user: UserInfo | null
  accessToken: string | null
  refreshToken: string | null
  /** 登录 / 初始化成功后写入完整认证信息 */
  setAuth: (result: LoginResult) => void
  /** token 刷新后更新（保持 user 不变） */
  setTokens: (tokens: Tokens) => void
  /** 更新当前用户信息（个人信息修改 / 拉取 me 接口后） */
  setUser: (user: UserInfo) => void
  /** 清空登录态 */
  clear: () => void
}

/** 认证状态：持久化到 localStorage（key: wiki-auth） */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: ({ user, accessToken, refreshToken }) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (tokens) => set(tokens),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'wiki-auth' },
  ),
)
