/** 前端构建版本：用于部署后轮询 version.json，提示用户刷新。 */

export const VERSION_POLL_MS = 60_000

export function parseVersionPayload(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const version = (raw as { version?: unknown }).version
  if (typeof version !== 'string') return null
  const trimmed = version.trim()
  return trimmed ? trimmed : null
}

export function isNewerAppVersion(current: string | undefined, remote: string | null): boolean {
  if (!current || !remote) return false
  return current !== remote
}

async function defaultFetchVersion(): Promise<unknown> {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json() as Promise<unknown>
}

export function startVersionPolling(opts: {
  current: string | undefined
  onNewer: () => void
  intervalMs?: number
  fetchVersion?: () => Promise<unknown>
}): () => void {
  let stopped = false
  let notified = false

  const check = async () => {
    if (stopped || notified) return
    try {
      const raw = await (opts.fetchVersion ?? defaultFetchVersion)()
      const remote = parseVersionPayload(raw)
      if (isNewerAppVersion(opts.current, remote)) {
        notified = true
        opts.onNewer()
      }
    } catch {
      // 网络抖动忽略，等下一轮
    }
  }

  void check()
  const id = window.setInterval(check, opts.intervalMs ?? VERSION_POLL_MS)
  const onVis = () => {
    if (document.visibilityState === 'visible') void check()
  }
  document.addEventListener('visibilitychange', onVis)
  return () => {
    stopped = true
    window.clearInterval(id)
    document.removeEventListener('visibilitychange', onVis)
  }
}
