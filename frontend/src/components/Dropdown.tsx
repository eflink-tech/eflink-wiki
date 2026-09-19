import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/utils'

interface DropdownProps {
  /** 触发器内容（点击切换展开） */
  trigger: ReactNode
  children: ReactNode
  /** 菜单对齐方向 */
  align?: 'left' | 'right'
  /** 附加到菜单面板的 class（可控制宽度等） */
  menuClassName?: string
  /** 受控展开（传入后以外部状态为准） */
  open?: boolean
  /** 受控展开变化回调 */
  onOpenChange?: (open: boolean) => void
  /** 点击菜单内部后是否自动收起（默认 true；通知面板这类含交互的面板传 false） */
  closeOnItemClick?: boolean
}

/** 轻量下拉菜单：点击触发，点击外部或 Esc 关闭；点击菜单任意位置后自动收起（可用 closeOnItemClick 关闭） */
export function Dropdown({
  trigger,
  children,
  align = 'left',
  menuClassName,
  open: controlledOpen,
  onOpenChange,
  closeOnItemClick = true,
}: DropdownProps) {
  const [innerOpen, setInnerOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : innerOpen
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    if (isControlled) {
      onOpenChange?.(typeof next === 'function' ? next(controlledOpen!) : next)
    } else {
      setInnerOpen(next)
    }
  }
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isControlled, controlledOpen])

  return (
    <div ref={ref} className="relative">
      <div className="flex" onClick={() => setOpen((o) => !o)}>
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] rounded-pop border border-line bg-surface p-1 shadow-3',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName,
          )}
          onClick={() => {
            if (closeOnItemClick) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps {
  icon?: ReactNode
  danger?: boolean
  /** 高亮当前项（如空间切换器中的当前空间） */
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}

/** 下拉菜单项 */
export function DropdownItem({
  icon,
  danger,
  active,
  disabled,
  onClick,
  children,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-ink-3 opacity-60'
          : danger
            ? 'text-danger hover:bg-danger-light'
            : active
              ? 'bg-brand-light text-brand'
              : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

/** 菜单分组分隔线 */
export function DropdownDivider() {
  return <div className="my-1 border-t border-line" />
}
