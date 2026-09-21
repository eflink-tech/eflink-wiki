import type { ComponentProps } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '../lib/utils'

/** 分栏拖拽手柄属性（其余 div 属性透传，用于接收 useResizableSplit 的 handleProps） */
interface SplitHandleProps extends ComponentProps<'div'> {
  /** 是否正在拖拽（手柄高亮显示） */
  dragging?: boolean
}

/**
 * 左右分栏拖拽手柄：
 * 配合 useResizableSplit 使用，将其 handleProps 展开到本组件上。
 * 拖拽调整左右宽度，双击重置为默认宽度。
 */
export function SplitHandle({ dragging = false, className, ...props }: SplitHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整左右宽度，双击重置"
      className={cn(
        // 宽度与 useResizableSplit 的 SPLIT_HANDLE_WIDTH 保持一致（w-4 = 16px）
        'group flex w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center',
        className
      )}
      {...props}
    >
      {/* 中部握把：平时为浅色图标，悬停 / 拖拽时高亮 */}
      <span
        className={cn(
          'flex h-9 items-center justify-center rounded-full transition-colors',
          dragging
            ? 'bg-brand-light text-brand'
            : 'text-ink-3/40 group-hover:bg-sunken group-hover:text-brand'
        )}
      >
        <GripVertical className="h-4 w-4" />
      </span>
    </div>
  )
}
