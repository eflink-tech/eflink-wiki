import { useState, type FormEvent } from 'react'
import * as authApi from '../api/auth'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { toast } from '../components/Toast'
import { useAuthStore } from '../store/authStore'

/** 首次初始化引导：创建管理员账号并自动登录（仅 initialized=false 时可访问） */
export default function SetupPage() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !displayName.trim() || !password) {
      setError('请填写完整信息')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== confirmPwd) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.setup({
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      })
      setAuth(res)
      toast.success('初始化完成，欢迎使用！')
      // 整页跳转，让顶层门卫重新拉取初始化状态
      window.location.assign('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败，请稍后重试')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            W
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-800">系统初始化</h1>
          <p className="mt-1 text-center text-xs text-slate-400">
            首次使用，请创建管理员账号
          </p>
        </div>
        <form className="mt-8" onSubmit={submit}>
          <Input
            label="管理员账号"
            placeholder="用于登录的用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <Input
            label="姓名"
            placeholder="显示名称，如：张三"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="密码"
            type="password"
            placeholder="至少 6 位"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="确认密码"
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            完成初始化并进入
          </Button>
        </form>
      </div>
    </div>
  )
}
