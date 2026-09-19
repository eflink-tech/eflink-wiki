import { LoaderCircle } from 'lucide-react'

/** 行内加载图标 */
export function Spinner({
  size = 16,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <LoaderCircle
      size={size}
      className={`animate-spin text-ink-3 ${className ?? ''}`}
    />
  )
}

/** 整页加载占位（初始化检查 / 路由懒加载等待时使用） */
export function FullPageLoading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg">
      <LoaderCircle size={26} className="animate-spin text-brand" />
      <p className="text-sm text-ink-3">{text}</p>
    </div>
  )
}
