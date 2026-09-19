/**
 * 浮动大纲卡片（阅读/编辑态共用；演示模式不渲染）。
 *
 * 2026-09-17 UI 改版（P2）：原「右侧浮动圆钮组」（目录/宽窄切换）已撤销，
 * 相应操作平铺进 PageView 的二级工具条（阅读态）与子栏（编辑态），
 * 消除浮动按钮遮挡「编辑中」状态徽标的缺陷；本文件仅保留大纲卡片 TocPanel。
 *
 * - 面板提取当前文档 H1~H3（编辑态取 editor.getJSON()，阅读态取 page.content JSON），
 *   按层级缩进；点击条目按「文档中第 N 个 heading」查 .ProseMirror 内 h1/h2/h3 DOM
 *   顺序 scrollIntoView 平滑定位；滚动时高亮当前可见标题。
 */
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

/** 大纲条目 */
interface TocHeading {
  level: 1 | 2 | 3
  text: string
}

/** 从 ProseMirror JSON（对象）按文档顺序提取 heading（H1~H3） */
function extractHeadings(json: unknown): TocHeading[] {
  const out: TocHeading[] = []
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    // Tiptap getJSON 中 heading 的层级在 attrs.level（兼容顶层 level 字段）
    const node = value as {
      type?: string
      level?: number
      attrs?: { level?: number }
      content?: unknown[]
    }
    if (node.type === 'heading') {
      const level = node.attrs?.level ?? node.level
      if (level === 1 || level === 2 || level === 3) {
        const text = (node.content ?? [])
          .map((c) => ((c as { text?: string }).text ?? ''))
          .join('')
        out.push({ level, text })
      }
      return // 标题内部只有行内内容，无需下钻
    }
    node.content?.forEach(walk)
  }
  walk(json)
  return out
}

/** 查询当前文档全部 heading DOM（.ProseMirror 内 h1/h2/h3，文档顺序） */
function queryHeadingEls(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')
}

/** 编辑态标题随输入实时变化：订阅 editor.update 后重算 */
function useTocHeadings(editor: Editor | null, contentJson: string | null): TocHeading[] {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const bump = () => setTick((t) => t + 1)
    editor.on('update', bump)
    return () => {
      editor.off('update', bump)
    }
  }, [editor])
  return useMemo(() => {
    if (editor) {
      try {
        return extractHeadings(editor.getJSON())
      } catch {
        return []
      }
    }
    if (contentJson) {
      try {
        return extractHeadings(JSON.parse(contentJson))
      } catch {
        return []
      }
    }
    return []
  }, [editor, contentJson, tick])
}

/**
 * 当前可见标题高亮（简化实现）：监听 ProseMirror 最近滚动容器的 scroll，
 * 取「容器顶部（+90px 阈值）以上最后一个 heading」为当前标题。
 */
function useActiveHeading(headings: TocHeading[]): number {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (headings.length === 0) {
      setActive(-1)
      return
    }
    let raf = 0
    const compute = () => {
      raf = 0
      const els = queryHeadingEls()
      if (els.length === 0) return
      // 找编辑器的滚动容器（最近的 overflow 可滚动祖先）
      const pm = document.querySelector('.ProseMirror')
      const scroller = pm?.parentElement?.closest('*')
      let container: HTMLElement | null = null
      let node: HTMLElement | null = scroller as HTMLElement | null
      while (node) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY)) {
          container = node
          break
        }
        node = node.parentElement
      }
      const top = container ? container.getBoundingClientRect().top : 0
      let idx = 0
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= top + 90) idx = i
      })
      setActive(idx)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute)
    }
    compute()
    const pm = document.querySelector('.ProseMirror')
    const container = pm?.parentElement?.closest('*')
    let node: HTMLElement | null = container as HTMLElement | null
    while (node) {
      const style = getComputedStyle(node)
      if (/(auto|scroll)/.test(style.overflowY)) {
        node.addEventListener('scroll', onScroll, { passive: true })
        break
      }
      node = node.parentElement
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      node?.removeEventListener('scroll', onScroll)
    }
  }, [headings])
  return active
}

/** 浮动大纲卡片 props */
interface TocPanelProps {
  editor: Editor | null
  contentJson: string | null
  /** 点击面板头部的关闭按钮 */
  onCollapse: () => void
}

/**
 * 右上角浮动大纲卡片（文档站「目录」样式）：
 * 固定于视口右上（顶栏下方），不挤压正文；头部「目录」标题 + 关闭按钮（X）；
 * 条目按层级缩进，当前可见标题带主色左指示条高亮。
 */
export function TocPanel({ editor, contentJson, onCollapse }: TocPanelProps) {
  const headings = useTocHeadings(editor, contentJson)
  const activeIdx = useActiveHeading(headings)

  const scrollToHeading = (index: number) => {
    const el = queryHeadingEls()[index]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="no-print fixed right-6 top-28 z-40 flex max-h-[70vh] w-[300px] flex-col overflow-hidden rounded-pop border border-line bg-surface shadow-3">
      {/* 头部：目录标题 + 关闭按钮 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <span className="text-sm font-semibold text-ink-1">目录</span>
        <button
          type="button"
          title="关闭目录"
          className="flex h-7 w-7 items-center justify-center rounded-ctrl text-ink-3 transition-colors hover:bg-sunken hover:text-ink-2"
          onClick={onCollapse}
        >
          <X size={16} />
        </button>
      </div>

      {/* 条目列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {headings.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-3">文档暂无标题</p>
        ) : (
          headings.map((h, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'relative block w-full truncate py-1.5 pr-3 text-left text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1',
                activeIdx === i && 'bg-brand-light font-medium text-brand hover:bg-brand-light hover:text-brand',
              )}
              style={{ paddingLeft: 16 + (h.level - 1) * 18 }}
              title={h.text}
              onClick={() => scrollToHeading(i)}
            >
              {activeIdx === i && (
                <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand" />
              )}
              {h.text || '（无标题文本）'}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
