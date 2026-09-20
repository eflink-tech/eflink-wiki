import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as authApi from '../api/auth'
import type { CaptchaInfo, PublicConfig } from '../api/types'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Input } from '../components/Input'
import { useAuthStore } from '../store/authStore'
import eflinkLogoUrl from '../assets/eflink-logo.png'
import logoUrl from '../assets/wiki-logo.png'

/** 关联登录防 CSRF state 的会话级存储键 */
const CONNECTOR_STATE_KEY = 'wiki_connector_state'

/** 新用户建档后引导创建个人专属空间的标记键 */
export const ONBOARD_SPACE_KEY = 'wiki_onboard_space'

/** 登录页：账号 + 密码，captchaEnabled 时展示图形验证码（可点击刷新）；支持 eflink 主站关联登录 */
export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [searchParams, setSearchParams] = useSearchParams()
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState<CaptchaInfo | null>(null)
  const [captchaCode, setCaptchaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // 主站关联登录：跳转中 / 撞名待授权绑定
  const [connecting, setConnecting] = useState(false)
  const [conflict, setConflict] = useState<{ bindTicket: string; username: string } | null>(null)
  const [bindPassword, setBindPassword] = useState('')
  const [bindError, setBindError] = useState('')
  const [binding, setBinding] = useState(false)
  const ticketHandledRef = useRef(false)

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

  /** 主站整页回跳携带 ticket：校验 state 后兑换登录态 */
  useEffect(() => {
    const ticket = searchParams.get('ticket')
    const state = searchParams.get('state')
    if (searchParams.get('connector') !== 'eflink' || !ticket || ticketHandledRef.current) return
    ticketHandledRef.current = true
    const savedState = sessionStorage.getItem(CONNECTOR_STATE_KEY)
    sessionStorage.removeItem(CONNECTOR_STATE_KEY)
    // 清掉 URL 上的一次性票据，避免刷新重放
    setSearchParams({}, { replace: true })
    if (!savedState || savedState !== state) {
      setError('授权校验失败，请重新发起登录')
      return
    }
    setLoading(true)
    authApi
      .connectorLogin({ ticket, state: state ?? '' })
      .then((res) => {
        if (res.status === 'conflict' && res.bindTicket) {
          setConflict({ bindTicket: res.bindTicket, username: res.conflictUsername ?? '' })
          return
        }
        if (res.auth) {
          if (res.created) sessionStorage.setItem(ONBOARD_SPACE_KEY, '1')
          setAuth(res.auth)
          navigate('/app', { replace: true })
        } else {
          setError('登录失败，请重新发起登录')
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '登录失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }, [searchParams, setSearchParams, navigate, setAuth])

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

  /** 整页跳转主站授权（state 存 sessionStorage 供回跳校验） */
  const startConnector = async () => {
    setConnecting(true)
    setError('')
    try {
      const res = await authApi.connectorStart()
      sessionStorage.setItem(CONNECTOR_STATE_KEY, res.state)
      window.location.href = res.authorizeUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起授权失败，请稍后重试')
      setConnecting(false)
    }
  }

  /** 撞名冲突：输本地账号密码证明归属，绑定后登录 */
  const submitBind = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!conflict || !bindPassword) {
      setBindError('请输入该账号的密码')
      return
    }
    setBinding(true)
    setBindError('')
    try {
      const res = await authApi.connectorBind({ bindTicket: conflict.bindTicket, password: bindPassword })
      if (res.auth) {
        setAuth(res.auth)
        navigate('/app', { replace: true })
      } else {
        setBindError('绑定失败，请重新发起登录')
      }
    } catch (err) {
      setBindError(err instanceof Error ? err.message : '绑定失败，请重试')
      setBinding(false)
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
        {config?.eflinkLoginEnabled && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-100" />
              <span className="text-[11px] text-slate-300">或</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
            <Button
              variant="default"
              className="w-full"
              loading={connecting}
              onClick={() => void startConnector()}
            >
              <img src={eflinkLogoUrl} alt="" className="mr-1.5 h-4 w-4 rounded" draggable={false} />
              易飞办公账号登录
            </Button>
          </>
        )}
        <p className="mt-6 text-center text-[11px] text-slate-300">
          账号由管理员统一创建，如需开通请联系管理员
        </p>
      </div>

      <Dialog
        open={!!conflict}
        title="确认账号关联"
        onClose={() => {
          setConflict(null)
          setBindPassword('')
          setBindError('')
        }}
        footer={
          <>
            <Button variant="default" onClick={() => setConflict(null)}>
              取消
            </Button>
            <Button variant="primary" loading={binding} onClick={() => void submitBind()}>
              确认关联并登录
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          主站账号 <b>{conflict?.username}</b> 与站内已有账号同名。为防止账号被误接管，
          请输入站内账号密码以证明归属并完成关联。
        </p>
        <div className="mt-3">
          <Input
            label="站内账号密码"
            type="password"
            placeholder={`账号 ${conflict?.username ?? ''} 的密码`}
            value={bindPassword}
            onChange={(e) => setBindPassword(e.target.value)}
          />
        </div>
        {bindError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{bindError}</p>
        )}
      </Dialog>
    </div>
  )
}
