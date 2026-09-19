import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import type { CaptchaInfo, PublicConfig } from '../api/types'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useAuthStore } from '../store/authStore'
import logoUrl from '../assets/wiki-logo.png'

/** 登录页：账号 + 密码，captchaEnabled 时展示图形验证码（可点击刷新） */
export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState<CaptchaInfo | null>(null)
  const [captchaCode, setCaptchaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    authApi
      .getPublicConfig()
      .then((cfg) => {
        if (!alive) return
        setConfig(cfg)
        if (cfg.captchaEnabled) refreshCaptcha()
      })
      .catch(() => {
        if (alive) setConfig(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const refreshCaptcha = () => {
    setCaptchaCode('')
    authApi
      .getCaptcha()
      .then(setCaptcha)
      .catch(() => setCaptcha(null))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入账号和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login({
        username: username.trim(),
        password,
        captchaId: captcha?.captchaId,
        captchaCode: captchaCode || undefined,
      })
      setAuth(res)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试')
      setLoading(false)
      if (config?.captchaEnabled) refreshCaptcha()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center">
          <img src={logoUrl} alt="易飞知识库 Logo" className="h-12 w-12" draggable={false} />
          <h1 className="mt-4 text-xl font-bold text-slate-800">
            {config?.productName ?? '易飞知识库'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {config?.version ? `v${config.version} · ` : ''}企业内部知识库
          </p>
        </div>
        <form className="mt-8" onSubmit={submit}>
          <Input
            label="账号"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <Input
            label="密码"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {config?.captchaEnabled && captcha?.image && (
            <label className="mb-3 block">
              <span className="mb-1.5 block text-[13px] font-medium text-slate-600">
                验证码
              </span>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  maxLength={6}
                  placeholder="输入图中字符"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                />
                <img
                  src={captcha.image}
                  alt="验证码"
                  title="点击刷新"
                  className="h-9 cursor-pointer rounded-md border border-slate-200"
                  onClick={refreshCaptcha}
                />
              </div>
            </label>
          )}
          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            登 录
          </Button>
        </form>
        <p className="mt-6 text-center text-[11px] text-slate-300">
          账号由管理员统一创建，如需开通请联系管理员
        </p>
      </div>
    </div>
  )
}
