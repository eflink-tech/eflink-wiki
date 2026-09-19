import { CircleCheck, CircleX, Info } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

/* ---------------- 简易事件总线 ----------------
 * 任何模块可直接 import { toast } 弹出提示，无需包裹 Provider。
 */
type Listener = (items: ToastItem[]) => void
const listeners = new Set<Listener>()
let items: ToastItem[] = []
let seq = 0

function emit(): void {
  listeners.forEach((l) => l([...items]))
}

function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id)
  emit()
}

function push(type: ToastType, message: string): void {
  const id = ++seq
  items = [...items, { id, type, message }]
  emit()
  window.setTimeout(() => dismiss(id), 3200)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
}

/* ---------------- 渲染宿主（挂在应用根部一次即可） ---------------- */

const iconOf: Record<ToastType, ReactNode> = {
  success: <CircleCheck size={16} className="shrink-0 text-success" />,
  error: <CircleX size={16} className="shrink-0 text-danger" />,
  info: <Info size={16} className="shrink-0 text-brand" />,
}

/** 全局 Toast 容器：点击可提前关闭 */
export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>([])

  useEffect(() => {
    const listener: Listener = (next) => setList(next)
    listeners.add(listener)
    emit() // 同步已有消息
    return () => {
      listeners.delete(listener)
    }
  }, [])

  if (list.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-[80vw] cursor-pointer items-center gap-2 rounded-pop border border-line bg-surface px-4 py-2.5 text-sm text-ink-1 shadow-3',
          )}
          onClick={() => dismiss(t.id)}
        >
          {iconOf[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}
