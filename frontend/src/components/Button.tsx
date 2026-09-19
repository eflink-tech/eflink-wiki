import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'default' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  /** 为 true 时禁用并显示加载图标 */
  loading?: boolean
}

const variantCls: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover border border-transparent',
  default:
    'border border-line bg-surface text-ink-2 hover:border-brand hover:text-brand',
  danger: 'bg-danger text-white hover:bg-danger-hover border border-transparent',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink-1 border border-transparent',
}

/** 轻量按钮：primary 主色 / default 描边 / danger 危险 / ghost 幽灵 */
export function Button({
  variant = 'default',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-ctrl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        variantCls[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
