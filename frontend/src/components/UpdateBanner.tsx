import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { startVersionPolling } from '../lib/appVersion'
import { Button } from './Button'

/** 生产环境轮询 version.json：发现新构建后在右下角提示刷新 */
export function UpdateBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    return startVersionPolling({
      current: import.meta.env.WIKI_APP_VERSION,
      onNewer: () => setVisible(true),
    })
  }, [])

  if (!visible) return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[210] w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="text-sm font-medium text-slate-800">发现新版本</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        知识库前端已更新，刷新页面即可使用最新功能。
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
          <RefreshCw size={14} />
          立即刷新
        </Button>
      </div>
    </div>,
    document.body,
  )
}
