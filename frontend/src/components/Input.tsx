import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** 外部字段标签 */
  label?: string
  /** 前置图标 */
  prefix?: ReactNode
}

/** 轻量输入框：带可选标签与前缀图标 */
export function Input({ label, prefix, className, ...rest }: InputProps) {
  const el = (
    <div className="relative flex items-center">
      {prefix != null && (
        <span className="absolute left-2.5 flex items-center text-ink-3">
          {prefix}
        </span>
      )}
      <input
        className={cn(
          'h-9 w-full rounded-ctrl border border-transparent bg-sunken px-3 text-sm text-ink-1 outline-none transition-colors placeholder:text-ink-3 hover:border-line-strong focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15',
          prefix != null ? 'pl-8' : '',
          className,
        )}
        {...rest}
      />
    </div>
  )
  if (!label) return el
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-meta font-medium text-ink-2">
        {label}
      </span>
      {el}
    </label>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

/** 轻量多行输入框 */
export function Textarea({ label, className, ...rest }: TextareaProps) {
  const el = (
    <textarea
      className={cn(
        'w-full rounded-ctrl border border-transparent bg-sunken px-3 py-2 text-sm text-ink-1 outline-none transition-colors placeholder:text-ink-3 hover:border-line-strong focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...rest}
    />
  )
  if (!label) return el
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-meta font-medium text-ink-2">
        {label}
      </span>
      {el}
    </label>
  )
}
