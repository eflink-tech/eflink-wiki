import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

/** 拖拽手柄宽度（px），与 SplitHandle 组件的 w-4 保持一致 */
export const SPLIT_HANDLE_WIDTH = 16

/** useResizableSplit 配置项 */
interface UseResizableSplitOptions {
  /** 左栏初始宽度（px），默认 264 */
  initialWidth?: number
  /** 左栏可拖到的最小宽度（px），默认 180 */
  minWidth?: number
  /** 左栏可拖到的最大宽度（px），默认 480 */
  maxWidth?: number
  /** 双击手柄时重置到的宽度（px），默认回到 initialWidth */
  resetWidth?: number
  /** 拖拽结束 / 双击重置时回调最新宽度（可用于持久化，拖拽过程中不触发） */
  onWidthCommit?: (width: number) => void
}

/** useResizableSplit 返回值 */
interface UseResizableSplitResult {
  /** 挂到「左栏 + 手柄 + 右栏」的 flex 容器上（用于拖拽时换算指针位置） */
  containerRef: RefObject<HTMLDivElement | null>
  /** 当前左栏宽度（px） */
  width: number
  /** 左栏内联样式：固定像素宽度 */
  leftStyle: CSSProperties
  /** 是否正在拖拽（可用于手柄高亮、容器禁用选中等） */
  dragging: boolean
  /** 手柄事件 props，展开到 SplitHandle 或自定义手柄元素上 */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
    onDoubleClick: () => void
  }
}

/** 把宽度钳制到 [min, max] 并取整（避免亚像素抖动与超长浮点数） */
function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 左右分栏拖拽调宽 hook：配合 SplitHandle 组件使用。
 * 与 eflink-frontend 的同名 hook 同源，这里按侧栏场景改为固定像素宽度（窗口缩放不改变侧栏宽度）。
 * 基于 Pointer Events + 指针捕获，鼠标 / 触屏 / 触控笔均可拖拽；双击手柄重置。
 */
export function useResizableSplit({
  initialWidth = 264,
  minWidth = 180,
  maxWidth = 480,
  resetWidth,
  onWidthCommit,
}: UseResizableSplitOptions = {}): UseResizableSplitResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() => clampWidth(initialWidth, minWidth, maxWidth))
  const [dragging, setDragging] = useState(false)
  // 拖拽过程的最新宽度与状态放 ref，保证 pointerup 回调里同步可读、不受闭包影响
  const widthRef = useRef(width)
  const draggingRef = useRef(false)
  /** 本次拖拽中宽度是否发生过变化（没变则不触发提交回调） */
  const changedRef = useRef(false)

  const applyWidth = useCallback(
    (value: number) => {
      const clamped = clampWidth(value, minWidth, maxWidth)
      if (clamped !== widthRef.current) changedRef.current = true
      widthRef.current = clamped
      setWidth(clamped)
    },
    [minWidth, maxWidth]
  )

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault()
    draggingRef.current = true
    changedRef.current = false
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return
      const container = containerRef.current
      if (!container) return
      applyWidth(e.clientX - container.getBoundingClientRect().left)
    },
    [applyWidth]
  )

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      if (changedRef.current) onWidthCommit?.(widthRef.current)
    },
    [onWidthCommit]
  )

  const onDoubleClick = useCallback(() => {
    const target = resetWidth ?? initialWidth
    applyWidth(target)
    onWidthCommit?.(target)
  }, [applyWidth, resetWidth, initialWidth, onWidthCommit])

  const leftStyle: CSSProperties = {
    width,
    flex: 'none',
  }

  return {
    containerRef,
    width,
    leftStyle,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick,
    },
  }
}
