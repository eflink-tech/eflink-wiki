/**
 * Slash 浮动菜单：空行（或段落行首）输入 "/" 弹出。分组标题 + 扁平列表（无二级菜单）：
 * - 基础块 / 媒体 / 高级 / 嵌入块 四组，嵌入块五类直接平铺（自动命名，不再弹命名框）
 * - 输入过滤（"/" 之后的文字作为关键词，匹配中文名或拼音），空组整体隐藏
 * - ↑/↓ 跨组连续移动高亮、Enter 确认、Esc 关闭
 * - 图片/附件项触发隐藏文件框上传；链接/日期/视频/音频/网页/表情/子页面走对应弹层
 */
import type { Editor } from '@tiptap/core'
import {
  Calendar,
  ChevronRight,
  Code,
  Columns2,
  FileText,
  Globe,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Music,
  Paperclip,
  Smile,
  Table,
  TextQuote,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EMBED_TYPE_META } from './EmbedCardView'
import { EmojiPicker, DateDialog, LinkDialog, MediaUrlDialog } from './SlashDialogs'
import PagePickerDialog, { type PickedPage } from './PagePickerDialog'
import { uploadFile, uploadImage } from './upload'
import type { EmbedType } from '../../services/embedStorage'
import {
  pickCaretAnchor,
  placeSlashMenu,
  type SlashMenuAnchor,
} from './slashMenuLayout'
import { insertEmoji, replaceRangeWithText } from './slashInsert'

interface SlashItem {
  key: string
  group: GroupKey
  label: string
  desc?: string
  icon: LucideIcon
  keywords?: string
  /** 直接执行的命令（调用时 "/" 查询文本已被删除） */
  run?: (editor: Editor) => void
  /** 需要弹层/面板的项：记录 "/" 位置后打开对应弹层 */
  dialog?: 'link' | 'date' | 'video' | 'audio' | 'webpage' | 'emoji' | 'pageRef'
  /** 高亮时右侧浮出选择面板的项（分栏）：点击按当前选择插入 */
  flyout?: boolean
}

type GroupKey = 'basic' | 'media' | 'advanced' | 'embed'

const GROUP_LABELS: Record<GroupKey, string> = {
  basic: '基础块',
  media: '媒体',
  advanced: '高级',
  embed: '嵌入块',
}

/** 生成 UUID（嵌入块 id） */
function genId(prefix: string): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 弹层会话：记录 "/" 位置（确认时先删掉 "/query" 再插入）与光标锚点（表情面板定位用） */
interface DialogSession {
  kind: NonNullable<SlashItem['dialog']>
  from: number
  to: number
  top: number
  left: number
  cursorTop: number
  cursorBottom: number
}

const ITEMS: SlashItem[] = [
  /* ── 基础块 ── */
  { key: 'h1', group: 'basic', label: '标题 1', desc: '大标题', icon: Heading1, keywords: 'h1 heading biaoti', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2', group: 'basic', label: '标题 2', desc: '小标题', icon: Heading2, keywords: 'h2 heading biaoti', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', group: 'basic', label: '标题 3', desc: '三级标题', icon: Heading3, keywords: 'h3 heading biaoti', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'bulletList', group: 'basic', label: '无序列表', desc: '简单列表', icon: List, keywords: 'ul bullet wuxu liebiao list', run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'orderedList', group: 'basic', label: '有序列表', desc: '带编号列表', icon: ListOrdered, keywords: 'ol ordered youxu liebiao list', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'taskList', group: 'basic', label: '任务列表', desc: '带勾选框', icon: ListTodo, keywords: 'todo task renwu check', run: (e) => e.chain().focus().toggleTaskList().run() },
  { key: 'blockquote', group: 'basic', label: '引用', desc: '摘录内容', icon: TextQuote, keywords: 'quote yinyong blockquote', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { key: 'codeBlock', group: 'basic', label: '代码块', desc: '等宽代码', icon: Code, keywords: 'code daima snippet', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { key: 'table', group: 'basic', label: '表格', desc: '3 行 3 列', icon: Table, keywords: 'table biaoge grid', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'hr', group: 'basic', label: '分割线', desc: '水平分隔', icon: Minus, keywords: 'hr divider fengexian rule', run: (e) => e.chain().focus().setHorizontalRule().run() },
  /* ── 媒体 ── */
  {
    key: 'image',
    group: 'media',
    label: '图片',
    desc: '上传并插入',
    icon: ImagePlus,
    keywords: 'image tupian photo upload img',
    run: () => {
      // 触发宿主隐藏的文件选择框（见组件内的 input[type=file]）
      if (typeof document !== 'undefined') document.getElementById('wiki-slash-image-input')?.click()
    },
  },
  { key: 'video', group: 'media', label: '视频', desc: '上传或粘贴外链', icon: Video, keywords: 'video shipin mp4 media', dialog: 'video' },
  { key: 'audio', group: 'media', label: '音频', desc: '上传或粘贴外链', icon: Music, keywords: 'audio yinpin mp3 music', dialog: 'audio' },
  {
    key: 'attachment',
    group: 'media',
    label: '附件',
    desc: '上传文档/压缩包等',
    icon: Paperclip,
    keywords: 'attachment fu jian file wenjian upload',
    run: () => {
      if (typeof document !== 'undefined') document.getElementById('wiki-slash-attachment-input')?.click()
    },
  },
  { key: 'webpage', group: 'media', label: '网页', desc: '内嵌外部页面', icon: Globe, keywords: 'webpage wangye web iframe url lianjie', dialog: 'webpage' },
  /* ── 高级 ── */
  { key: 'pageRef', group: 'advanced', label: '子页面', desc: '引用站内页面', icon: FileText, keywords: 'page reference ziye mian yemian link', dialog: 'pageRef' },
  { key: 'columns', group: 'advanced', label: '分栏', desc: '并排布局，可选 1-4 栏', icon: Columns2, keywords: 'columns fenlan layout duo lie', flyout: true },
  { key: 'date', group: 'advanced', label: '日期', desc: '插入日期文本', icon: Calendar, keywords: 'date riqi day time', dialog: 'date' },
  { key: 'emoji', group: 'advanced', label: '表情', desc: '插入 emoji', icon: Smile, keywords: 'emoji biaoqing face', dialog: 'emoji' },
  { key: 'link', group: 'advanced', label: '链接', desc: '插入超链接', icon: Link2, keywords: 'link lianjie href url chaolianjie', dialog: 'link' },
  /* ── 嵌入块（平铺，自动命名） ── */
  ...(['word', 'excel', 'pptx', 'draw', 'mindmap'] as EmbedType[]).map((type) => ({
    key: `embed-${type}`,
    group: 'embed' as GroupKey,
    label: EMBED_TYPE_META[type].label,
    desc: '创建并嵌入',
    icon: EMBED_TYPE_META[type].icon,
    keywords:
      type === 'draw'
        ? 'flow diagram liuchengtu'
        : type === 'mindmap'
          ? 'siweidaotu mind'
          : type === 'excel'
            ? 'sheet biaoge'
            : type === 'word'
              ? 'doc wendang'
              : 'slide yanbidemo ppt',
    run: (editor: Editor) => {
      editor
        .chain()
        .focus()
        .insertEmbedCard({ embedId: genId('embed'), embedType: type, title: EMBED_TYPE_META[type].label })
        .run()
    },
  })),
]

/** 菜单打开时的定位与查询状态 */
interface SlashState {
  /** "/" 字符（或锚定光标）的绝对位置 */
  from: number
  /** 光标位置 */
  to: number
  top: number
  left: number
  /** 光标顶部（视口坐标，向上翻转时以此为底） */
  cursorTop: number
  /** 光标底部（表情等矮面板按此贴着光标排，而不是跟满高菜单一起上翻） */
  cursorBottom: number
  /** "/" 之后的关键词 */
  query: string
}

/** 当前文本块的屏幕左右边界，用来纠正贴在块右缘的空行 caret */
function textblockClip(editor: Editor, from: number): { left: number; right: number } | undefined {
  try {
    const $pos = editor.state.doc.resolve(from)
    if ($pos.depth < 1) return undefined
    const el = editor.view.nodeDOM($pos.before($pos.depth)) as HTMLElement | null
    if (!el?.getBoundingClientRect) return undefined
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right }
  } catch {
    return undefined
  }
}

/** coordsAtPos 两侧取更靠左的完整矩形，避免宽表格/分栏把菜单钉到右缘 */
function caretAnchor(editor: Editor, from: number): SlashMenuAnchor | null {
  try {
    const c1 = editor.view.coordsAtPos(from, 1)
    const c2 = editor.view.coordsAtPos(from, -1)
    return pickCaretAnchor(c1, c2, textblockClip(editor, from))
  } catch {
    return null
  }
}

/** 按 "/"（或加号按钮锚点）计算菜单布局；位置不可见时返回 null */
function layoutMenu(
  editor: Editor,
  from: number,
  to: number,
  query: string,
  anchor?: SlashMenuAnchor,
): SlashState | null {
  const box = anchor ?? caretAnchor(editor, from)
  if (!box) return null
  const placed = placeSlashMenu(box, { width: window.innerWidth, height: window.innerHeight })
  return { from, to, query, ...placed }
}

/** 从编辑器当前状态推导菜单状态；不应弹出时返回 null */
function deriveSlashState(editor: Editor): SlashState | null {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty) return null
  const parent = $from.parent
  // 仅在文本块（段落/标题）内生效
  if (!parent.isTextblock || parent.type.spec.code) return null
  const text = parent.textContent
  if (!text.startsWith('/')) return null
  if ($from.parentOffset < 1 || $from.parentOffset !== text.length) return null
  const from = $from.pos - $from.parentOffset
  return layoutMenu(editor, from, $from.pos, text.slice(1))
}

/** 外部触发打开插入菜单的窗口事件名（块手柄「+」按钮使用） */
export const SLASH_OPEN_EVENT = 'wiki:slash-open'

/** 在指定文档位置打开插入菜单（无需输入 "/"；位置会取最近合法光标点） */
export function requestSlashMenu(pos: number, anchor?: SlashMenuAnchor): void {
  window.dispatchEvent(new CustomEvent(SLASH_OPEN_EVENT, { detail: { pos, anchor } }))
}

export type { SlashMenuAnchor }

export function SlashMenu({ editor }: { editor: Editor }) {
  const [state, setState] = useState<SlashState | null>(null)
  const [active, setActive] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const params = useParams()
  const spaceId = params.spaceId ? Number(params.spaceId) : undefined
  const currentNodeId = params.nodeId ? Number(params.nodeId) : undefined

  // 菜单渲染后按实测高度精修位置：向下溢出视口则翻到光标上方，再溢出则贴视口底滚动
  useLayoutEffect(() => {
    if (!state || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.bottom <= window.innerHeight - 8) return
    const h = rect.height
    let newTop: number
    if (state.cursorTop > h + 16) {
      // 光标上方能容下整个菜单：翻到光标上方
      newTop = Math.max(8, state.cursorTop - h - 8)
    } else {
      // 上下都放不下：贴视口底部，菜单内部滚动
      newTop = Math.max(8, window.innerHeight - h - 8)
    }
    // 值相同不再 setState，避免事务循环
    if (Math.abs(newTop - state.top) < 1) return
    setState({ ...state, top: newTop })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  // 弹层会话（链接/日期/媒体/网页/表情/子页面）
  const [session, setSession] = useState<DialogSession | null>(null)
  const sessionRef = useRef<DialogSession | null>(null)
  sessionRef.current = session
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  // 锚定模式（块手柄「+」打开）：光标锚点。非 null 时菜单不依赖 "/" 文本
  const anchorRef = useRef<{ from: number } | null>(null)
  // 分栏选择浮层：悬停/键盘移到「分栏」项时浮出，colCount 为当前选择栏数。
  // 显隐独立于 active 项：鼠标移进浮层（途经其他菜单项之外的区域）不会误关
  const [colCount, setColCount] = useState(2)
  const [colPos, setColPos] = useState<{ top: number; left: number } | null>(null)
  const [colFlyout, setColFlyout] = useState(false)
  // 延迟关闭：从菜单项移向浮层会短暂途经其他菜单项/空隙，立即关闭会导致浮层无法到达
  const colCloseTimer = useRef<number | null>(null)

  /** 立即收起分栏浮层（菜单关闭等确定场景） */
  const closeColFlyoutNow = () => {
    if (colCloseTimer.current) {
      window.clearTimeout(colCloseTimer.current)
      colCloseTimer.current = null
    }
    setColFlyout(false)
  }

  /** 延迟收起（途经其他菜单项时的缓冲，期间进入浮层/回到分栏项会取消） */
  const scheduleColClose = () => {
    if (colCloseTimer.current) window.clearTimeout(colCloseTimer.current)
    colCloseTimer.current = window.setTimeout(() => {
      colCloseTimer.current = null
      setColFlyout(false)
    }, 150)
  }

  const cancelColClose = () => {
    if (colCloseTimer.current) {
      window.clearTimeout(colCloseTimer.current)
      colCloseTimer.current = null
    }
  }

  /** 关闭菜单（常规/锚定通用）：清锚点 + 清状态 + 收起分栏浮层 */
  const closeMenu = () => {
    anchorRef.current = null
    setState(null)
    closeColFlyoutNow()
  }

  // 编辑器任意事务后重新推导菜单显隐与关键词
  useEffect(() => {
    const update = () => {
      const next = deriveSlashState(editor)
      if (next) {
        // 常规模式（"/" 触发）接管，解除锚定
        anchorRef.current = null
        setState(next)
        return
      }
      const anchor = anchorRef.current
      if (anchor) {
        // 锚定模式：光标仍在锚点保持打开；移开或输入正文则关闭（输入 "/" 自动转常规模式）
        if (editor.state.selection.from !== anchor.from) {
          anchorRef.current = null
          setState(null)
          setActive(0)
        }
        return
      }
      setState(null)
      setActive(0)
      closeColFlyoutNow()
    }
    update()
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  // 块手柄「+」按钮等外部触发：锚定在指定位置打开菜单（无需输入 "/"）
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ pos?: number; anchor?: SlashMenuAnchor }>).detail
      if (typeof detail?.pos !== 'number') return
      const p = Math.max(0, Math.min(detail.pos, editor.state.doc.content.size))
      editor.commands.focus(p)
      // focus 会取最近合法光标位置；菜单位置优先用加号按钮矩形，避免 coordsAtPos 贴到宽块右缘
      const at = editor.state.selection.from
      const st = layoutMenu(editor, at, at, '', detail.anchor)
      if (!st) return
      anchorRef.current = { from: at }
      setActive(0)
      setState(st)
    }
    window.addEventListener(SLASH_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(SLASH_OPEN_EVENT, onOpen)
  }, [editor])

  // 页面滚动时菜单定位会漂移，直接关闭（下次输入 "/" 会重新弹出）；
  // 菜单自身的内部滚动（浏览菜单项）不关闭
  useEffect(() => {
    if (!state) return
    const close = (e: Event) => {
      const t = e.target
      if (t instanceof Node && menuRef.current?.contains(t)) return
      closeMenu()
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /** 过滤后的项（保持分组顺序） */
  const filtered = state
    ? ITEMS.filter(
        (it) =>
          !state.query ||
          it.label.toLowerCase().includes(state.query.toLowerCase()) ||
          (it.keywords ?? '').toLowerCase().includes(state.query.toLowerCase()),
      )
    : []

  // 分栏浮层定位：贴住「分栏」项右侧；右侧放不下翻到左侧；垂直方向按项对齐并夹在视口内
  useLayoutEffect(() => {
    if (!colFlyout || !state) {
      if (colPos !== null) setColPos(null)
      return
    }
    const el = itemRefs.current.get('columns')
    if (!el) return
    const rect = el.getBoundingClientRect()
    const PANEL_W = 324
    const PANEL_H = 150
    let left = rect.right + 8
    if (left + PANEL_W > window.innerWidth - 8) left = rect.left - PANEL_W - 8
    left = Math.max(8, left)
    const top = Math.min(Math.max(rect.top - 8, 8), Math.max(8, window.innerHeight - PANEL_H - 8))
    if (!colPos || Math.abs(colPos.left - left) > 1 || Math.abs(colPos.top - top) > 1) {
      setColPos({ top, left })
    }
  })

  // 键盘导航（capture 阶段拦截，避免 ProseMirror 抢先处理方向键/回车）
  useEffect(() => {
    if (!state) return
    const count = filtered.length
    const onKey = (e: KeyboardEvent) => {
      // 分栏项高亮时 ←/→ 调整栏数
      const activeItem = filtered[active]
      if (activeItem?.key === 'columns' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        e.stopPropagation()
        setColCount((c) => (e.key === 'ArrowRight' ? Math.min(4, c + 1) : Math.max(1, c - 1)))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const next = count === 0 ? 0 : (active + 1) % count
        setActive(next)
        if (filtered[next]?.flyout === true) {
          cancelColClose()
          setColFlyout(true)
        } else {
          scheduleColClose()
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const next = count === 0 ? 0 : (active - 1 + count) % count
        setActive(next)
        if (filtered[next]?.flyout === true) {
          cancelColClose()
          setColFlyout(true)
        } else {
          scheduleColClose()
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const item = filtered[active]
        if (item) activate(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeMenu()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  // 高亮项滚动到可视区
  useEffect(() => {
    if (!state) return
    const current = filtered[active]?.key
    if (current) itemRefs.current.get(current)?.scrollIntoView({ block: 'nearest' })
  })

  /** 删除 "/query" 后执行命令或打开对应弹层（锚定模式下 from=to，删除为空操作） */
  const activate = (item: SlashItem) => {
    if (!state) return
    const range = { from: state.from, to: state.to }
    // 分栏项：按当前选择的栏数直接插入（浮层悬停时可改栏数）
    if (item.flyout) {
      insertCols(colCount)
      return
    }
    if (item.dialog) {
      // 弹层项：先关菜单，确认时再删 "/" 文本（弹窗期间编辑器无事务，位置保持有效）
      const next = {
        kind: item.dialog,
        ...range,
        top: state.top,
        left: state.left,
        cursorTop: state.cursorTop,
        cursorBottom: state.cursorBottom,
      }
      sessionRef.current = next
      setSession(next)
      closeMenu()
      return
    }
    editor.chain().focus().deleteRange(range).run()
    closeMenu()
    item.run?.(editor)
  }

  /* ---------- 弹层确认回调：删除 "/" 文本后插入 ---------- */

  const withRange = (fn: (editor: Editor) => void) => {
    if (!session) return
    const { from, to } = session
    setSession(null)
    // 不调用 focus()：弹层点击后失焦，focus() 会把选区拉回旧位置
    editor.chain().deleteRange({ from, to }).run()
    fn(editor)
  }

  const confirmLink = (href: string, text: string) => {
    if (!session) return
    const { from, to } = session
    setSession(null)
    replaceRangeWithText(editor, from, to, text || href, [{ type: 'link', attrs: { href } }])
  }

  const confirmDate = (dateStr: string) => {
    if (!session) return
    const { from, to } = session
    setSession(null)
    replaceRangeWithText(editor, from, to, dateStr)
  }

  const confirmEmoji = (emoji: string) => {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    setSession(null)
    insertEmoji(editor, s.from, s.to, emoji)
  }

  const confirmMedia = (kind: 'video' | 'audio' | 'webpage', src: string) => {
    withRange((ed) => {
      if (kind === 'video') ed.chain().insertWikiVideo({ src }).run()
      else if (kind === 'audio') ed.chain().insertWikiAudio({ src }).run()
      else ed.chain().insertWebEmbed({ src }).run()
    })
  }

  const confirmPageRef = (page: PickedPage) => {
    withRange((ed) => {
      ed.chain().insertPageRef({ nodeId: page.nodeId, title: page.title }).run()
    })
  }

  /** 插入分栏（浮层色条点击 / 菜单项回车），并把光标放进第一栏的首个段落 */
  const insertCols = (count: number) => {
    if (!state) return
    editor.chain().focus().deleteRange({ from: state.from, to: state.to }).insertColumns({ count }).run()
    // insertContent 会以 NodeSelection 选中整个分栏，把光标下探到第一栏的段落里
    const sel = editor.state.selection
    if (sel.from !== sel.to) {
      let target: number | null = null
      editor.state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
        if (target === null && node.isTextblock && node.type.name === 'paragraph') target = pos
      })
      if (target !== null) editor.commands.setTextSelection(target + 1)
    }
    closeMenu()
  }

  /** 渲染分组标题（该组过滤后非空才显示） */
  const renderGroupHeader = (item: SlashItem | undefined, prev: SlashItem | undefined) => {
    if (!item || (prev && prev.group === item.group)) return null
    return (
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-slate-400 first:pt-1.5">
        {GROUP_LABELS[item.group]}
      </p>
    )
  }

  return (
    <>
      {state && (
        <div
          ref={menuRef}
          className="fixed z-[80] max-h-[min(470px,calc(100vh-16px))] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: state.top, left: state.left }}
        >
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">无匹配项</p>}
          {filtered.map((item, index) => {
            const Icon = item.icon
            return (
              <Fragment key={item.key}>
                {renderGroupHeader(item, filtered[index - 1])}
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.key, el)
                    else itemRefs.current.delete(item.key)
                  }}
                  type="button"
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                    index === active ? 'bg-slate-100 text-slate-800' : 'text-slate-600'
                  }`}
                  onMouseEnter={() => {
                    setActive(index)
                    // 移到「分栏」项立即展开；移到其他项延迟收起（指针可能正移向浮层）
                    if (item.flyout) {
                      cancelColClose()
                      setColFlyout(true)
                    } else {
                      scheduleColClose()
                    }
                  }}
                  onMouseDown={(e) => {
                    // mousedown 先于编辑器失焦处理，阻止默认避免选区丢失
                    e.preventDefault()
                    activate(item)
                  }}
                >
                  <Icon size={15} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-4">{item.label}</span>
                    {item.desc && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{item.desc}</span>}
                  </span>
                  {item.flyout && <ChevronRight size={14} className="shrink-0 text-slate-300" />}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* 分栏选择浮层：高亮「分栏」项时浮出，悬停色条预览栏数，点击插入。
          浮层自身接管 hover 状态：从菜单项移入浮层途中不会误关 */}
      {colFlyout && colPos && state && (
        <div
          className="fixed z-[81] w-[324px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: colPos.top, left: colPos.left }}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => {
            cancelColClose()
            setColFlyout(true)
          }}
          onMouseLeave={scheduleColClose}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm text-slate-600">选择分栏</span>
            <span className="text-sm text-slate-400">{colCount} 栏</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                title={`${n} 栏`}
                className={`h-20 flex-1 rounded-md transition-colors ${
                  n <= colCount ? 'bg-blue-500' : 'bg-slate-100 hover:bg-slate-200'
                }`}
                onMouseEnter={() => setColCount(n)}
                onMouseDown={(e) => {
                  // 与斜杠菜单项一致：用 mousedown 插入。父级 preventDefault 会吞掉后续 click
                  e.preventDefault()
                  e.stopPropagation()
                  insertCols(n)
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 图片上传用的隐藏文件框（slash 菜单「图片」项触发） */}
      <input
        id="wiki-slash-image-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          void uploadImage(file)
            .then((url) => {
              editor.chain().focus().setImage({ src: url }).run()
            })
            .catch(() => {
              // 上传失败已由拦截器提示
            })
        }}
      />

      {/* 附件上传用的隐藏文件框（slash 菜单「附件」项触发） */}
      <input
        id="wiki-slash-attachment-input"
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          void uploadFile(file)
            .then((url) => {
              editor
                .chain()
                .focus()
                .insertAttachment({ url, name: file.name, size: file.size })
                .run()
            })
            .catch(() => {
              // 上传失败已由拦截器提示
            })
        }}
      />

      {/* 链接弹层 */}
      <LinkDialog
        open={session?.kind === 'link'}
        onClose={() => setSession(null)}
        onConfirm={confirmLink}
      />

      {/* 日期弹层 */}
      <DateDialog
        open={session?.kind === 'date'}
        onClose={() => setSession(null)}
        onConfirm={confirmDate}
      />

      {/* 视频 / 音频 / 网页弹层 */}
      {(session?.kind === 'video' || session?.kind === 'audio' || session?.kind === 'webpage') && (
        <MediaUrlDialog
          open
          kind={session.kind}
          onClose={() => setSession(null)}
          onConfirm={(src) => confirmMedia(session.kind as 'video' | 'audio' | 'webpage', src)}
        />
      )}

      {/* 子页面选择器 */}
      <PagePickerDialog
        open={session?.kind === 'pageRef'}
        spaceId={spaceId}
        excludeNodeId={currentNodeId}
        onClose={() => setSession(null)}
        onPick={confirmPageRef}
      />

      {/* 表情面板：贴着光标/加号，按面板自身高度翻转，不沿用满高斜杠菜单的 top */}
      <EmojiPicker
        open={session?.kind === 'emoji'}
        left={session?.left ?? 0}
        cursorTop={session?.cursorTop ?? 0}
        cursorBottom={session?.cursorBottom ?? 0}
        onClose={() => setSession(null)}
        onPick={confirmEmoji}
      />
    </>
  )
}
