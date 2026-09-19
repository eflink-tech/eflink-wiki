import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** 底部按钮区；不传则不渲染底栏 */
  footer?: ReactNode
  /** 最大宽度（px），默认 420 */
  width?: number
}

/** 轻量模态框：Portal 渲染，Esc / 点击遮罩关闭 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 420,
}: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-1/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full rounded-pop bg-surface shadow-3"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-ink-1">{title}</h3>
          <button
            type="button"
            className="rounded-ctrl p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  content: ReactNode
  confirmText?: string
  danger?: boolean
  onClose: () => void
  /** 确认回调：成功后自动关闭；失败时保持打开（错误已由拦截器提示） */
  onConfirm: () => Promise<void>
}

/** 危险操作确认框（内部自带 loading 状态） */
export function ConfirmDialog({
  open,
  title,
  content,
  confirmText = '确定',
  danger,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const run = async () => {
    try {
      await onConfirm()
      onClose()
    } catch {
      // 拦截器已弹出错误提示
    }
  }
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void run()}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-2">{content}</div>
    </Dialog>
  )
}

/** 带错误提示的表单弹窗内联报错条 */
export function DialogError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p className="mb-3 rounded-ctrl bg-danger-light px-3 py-2 text-xs text-danger">
      {message}
    </p>
  )
}
