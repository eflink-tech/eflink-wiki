/**
 * 嵌入块只读预览管线（五种类型通用）：draw / mindmap 内联画布 + 预览弹窗正文共用。
 *
 * 调研结论：五个包均未导出只读渲染组件，也没有 readonly/预览 prop；但都支持
 * 「注入存储 + 挂载自带编辑器组件」。故采用统一方案实现"真·只读渲染"：
 * 1. 经现有 embedStorage 适配器预载文档并判空（空文档 → 'empty'，由调用方决定回落形态）；
 * 2. 注入「封闭存储」：load/get 恒返回本文档、save/put 全部空操作（预览绝不写库）；
 * 3. 懒挂载包内编辑器组件，隐藏全部编辑器 chrome（能内置关就内置关，否则 CSS 隐藏）、
 *    pointer-events 禁交互；
 * 4. 轮询包内 store / onDocLoaded 回调等待「文档已加载」信号（10s 超时兜底）；
 * 5. 包内全局存储为单例，同类型多个预览按模块级队列串行启动，避免互相覆盖；
 * 6. 挂载期间安装 window 捕获级键盘守卫（输入类元素与 Ctrl/Cmd 快捷键放行），
 *    防止页面上的普通按键被包内 window 快捷键处理器消费而误改只读预览。
 *
 * 各类型 chrome 隐藏方式：
 * - draw：CSS（AppLayout 顶/底栏 + 四块 aside；h-screen/w-screen 改填容器）
 * - mindmap：CSS（ToolBar / StatusBar 为根节点首/末子块）
 * - pptx：CSS（TopBar/BottomBar 为 AppLayout 第 1/3 个子块；缩略图/样式面板按 data-testid）
 * - word：组件 props（showToolbar/showCatalog/showStatusBar 全关）
 * - excel：组件 props（showToolbar/showFormulaBar 关）+ CSS 隐藏始终渲染的底栏
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import type { DocumentData as DrawDocumentData } from '@eflink-tech/draw'
import type { MindMapDocument, MindMapStorageBackend } from '@eflink-tech/mindmap'
import type { Presentation as PptxPresentation } from '@eflink-tech/pptx'
import type { StorageAdapter as WordStorageAdapter } from '@eflink-tech/word'
import type { StorageAdapter as ExcelStorageAdapter } from '@eflink-tech/excel'
import type { EmbedType } from '../../services/embedStorage'
import { cn } from '../../lib/utils'
import { Spinner } from '../Loading'

// 编辑器组件按类型懒加载（包体积大，各自独立分包，与 EmbedEditor 共享 chunk）
const DrawEditorLazy = lazy(() => import('@eflink-tech/draw').then((m) => ({ default: m.DrawEditor })))
const MindMapEditorLazy = lazy(() =>
  import('@eflink-tech/mindmap').then((m) => ({ default: m.MindMapEditor })),
)
const PptxEditorLazy = lazy(() => import('@eflink-tech/pptx').then((m) => ({ default: m.PptxEditor })))
const WordEditorLazy = lazy(() => import('@eflink-tech/word').then((m) => ({ default: m.WordEditor })))
const SheetEditorLazy = lazy(() => import('@eflink-tech/excel').then((m) => ({ default: m.SheetEditor })))

/** 支持预览的类型（五种全覆盖） */
export type PreviewableEmbedType = EmbedType

/* ───────────── 预览弹窗跨组件通信（NodeView 深处 → PageView） ───────────── */

/** 请求打开预览弹窗的事件名 */
export const EMBED_PREVIEW_EVENT = 'wiki:embed-preview'
/** 预览弹窗已关闭的事件名（同类型内联预览据此恢复渲染） */
export const EMBED_PREVIEW_CLOSED_EVENT = 'wiki:embed-preview-closed'

/** 事件负载 */
export interface EmbedPreviewDetail {
  type: EmbedType
  nodeId: number
  embedId: string
  title: string
}

/** 请求打开预览弹窗（EmbedCardView 的按钮/双击调用） */
export function requestEmbedPreview(detail: EmbedPreviewDetail): void {
  window.dispatchEvent(new CustomEvent<EmbedPreviewDetail>(EMBED_PREVIEW_EVENT, { detail }))
}

/* ───────────── 同类型预览启动队列：全局存储单例，串行注入避免互相覆盖 ───────────── */

const turnChains: Record<PreviewableEmbedType, Promise<unknown>> = {
  word: Promise.resolve(),
  excel: Promise.resolve(),
  pptx: Promise.resolve(),
  draw: Promise.resolve(),
  mindmap: Promise.resolve(),
}

/** 取一个启动位：resolve 出 release 函数；release 后才轮到下一个同类型预览 */
function acquireTurn(type: PreviewableEmbedType): Promise<() => void> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const prev = turnChains[type]
  turnChains[type] = prev.then(() => gate)
  return prev.then(() => release)
}

/** 轮询等待条件成立；超时返回 false（不抛错，预览尽力而为） */
function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) {
      resolve(true)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (check()) {
        window.clearInterval(timer)
        resolve(true)
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer)
        resolve(false)
      }
    }, 120)
  })
}

/* ───────────── 键盘守卫：阻断普通按键进入包内 window 快捷键（只读保护） ───────────── */

let guardCount = 0
let removeGuard: (() => void) | null = null

function acquireKeyGuard(): void {
  guardCount += 1
  if (removeGuard) return
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const editable =
      !!target &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    // 输入类元素与 Ctrl/Cmd/Alt 组合键放行；普通按键阻断（不 preventDefault，页面滚动等默认行为不受影响）
    if (editable || e.metaKey || e.ctrlKey || e.altKey) return
    e.stopImmediatePropagation()
  }
  // 先于编辑器包挂载注册（window 捕获按注册顺序触发），保证拦在包内处理器之前
  window.addEventListener('keydown', onKey, { capture: true })
  removeGuard = () => window.removeEventListener('keydown', onKey, { capture: true })
}

function releaseKeyGuard(): void {
  guardCount = Math.max(0, guardCount - 1)
  if (guardCount === 0 && removeGuard) {
    removeGuard()
    removeGuard = null
  }
}

/* ───────────── 启动流程（每种类型一个 boot；返回卸载清理函数） ───────────── */

/** boot 结果：ok=已挂载画布；empty=空文档（由调用方决定展示形态） */
type BootOutcome = 'ok' | 'empty'

interface BootContext {
  nodeId: number
  embedId: string
  /** 预览容器元素（draw 视口适配测量用） */
  bodyEl: HTMLElement | null
  /** word/excel 编辑器 onDocLoaded 置位的加载信号 */
  loadFlag: { done: boolean }
  /** word/excel 的 storage prop（boot 预载后写入，setReady 前生效） */
  extraRef: { current: unknown }
  setReady: () => void
  registerCleanup: (fn: () => void) => void
}

/** draw：经适配器预载文档 → 写本地缓存 + 注入封闭远端存储 → 挂载 → 等加载信号 → 适配视口 */
async function bootDraw(ctx: BootContext): Promise<BootOutcome> {
  const [drawMod, { createDrawStore }, { loadEmbedStyles }] = await Promise.all([
    import('@eflink-tech/draw'),
    import('../../services/embedStorage/draw'),
    import('../../services/embedStorage/styles'),
  ])
  const store = createDrawStore(ctx.nodeId, ctx.embedId)
  const doc: DrawDocumentData = await store.load()
  // 空白文档（无任何元素）：由调用方决定展示形态
  if (!doc.elements || Object.keys(doc.elements).length === 0) return 'empty'
  // 预写本地缓存：编辑器挂载先读 localStorage，避免远端覆盖前闪现旧内容
  drawMod.saveDocumentToStorage(doc)
  // 封闭远端存储：load 恒返回本文档，save 空操作（预览绝不写库）
  drawMod.setDrawRemoteStore({
    load: async () => doc,
    save: async () => {},
  })
  // 包样式随预览生命周期注入/移除（包内是第二套 Tailwind，不能常驻）
  const removeStyle = loadEmbedStyles('draw')
  ctx.registerCleanup(removeStyle)
  ctx.setReady()
  // 等待编辑器载入本文档（元素 id 集合一致即认为加载完成）
  const expected = Object.keys(doc.elements)
    .sort()
    .join(',')
  const loaded = await waitFor(() => {
    const state = drawMod.useEditorStore.getState() as unknown as {
      document?: { elements?: Record<string, unknown> }
    }
    const ids = state.document?.elements
      ? Object.keys(state.document.elements)
          .sort()
          .join(',')
      : ''
    return ids !== '' && ids === expected
  }, 10000)
  // 加载成功后按容器尺寸适配整页缩放（初始视口为 1:1，大画布会溢出）
  if (loaded && ctx.bodyEl) {
    const pageW = Number(doc.page?.width ?? 0)
    const pageH = Number(doc.page?.height ?? 0)
    if (pageW > 0 && pageH > 0) {
      const scale = Math.min(1, (ctx.bodyEl.clientWidth - 24) / pageW, (ctx.bodyEl.clientHeight - 24) / pageH)
      if (Number.isFinite(scale) && scale > 0) {
        ;(drawMod.useEditorStore as unknown as {
          setState: (partial: { viewport: { x: number; y: number; scale: number } }) => void
        }).setState({ viewport: { x: 0, y: 0, scale } })
      }
    }
  }
  return 'ok'
}

/** mindmap：读后端内容 → 注入封闭存储后端 → 挂载（bootDocId=embedId）→ 等加载信号 */
async function bootMindmap(ctx: BootContext): Promise<BootOutcome> {
  const [mmMod, { parseEmbedContent }, { getEmbedData }, { loadEmbedStyles }] = await Promise.all([
    import('@eflink-tech/mindmap'),
    import('../../services/embedStorage/core'),
    import('../../api/wiki'),
    import('../../services/embedStorage/styles'),
  ])
  const data = await getEmbedData(ctx.nodeId, ctx.embedId)
  const parsed = parseEmbedContent(data.content) as MindMapDocument | null
  // 缺 rootId/nodes 视为空白导图
  if (!parsed || !parsed.rootId || !parsed.nodes || Object.keys(parsed.nodes).length === 0) {
    return 'empty'
  }
  const doc: MindMapDocument = { ...parsed, id: ctx.embedId }
  // 封闭存储后端：get 恒返回本文档，写操作全部空实现（预览绝不写库）
  const backend: MindMapStorageBackend = {
    get: async () => doc,
    put: async (_doc: MindMapDocument) => {},
    remove: async (_id: string) => {},
    list: async () => [],
    rename: async () => {},
  }
  mmMod.setMindMapStorageBackend(backend)
  const removeStyle = loadEmbedStyles('mindmap')
  ctx.registerCleanup(removeStyle)
  ctx.setReady()
  // MindMapEditor 载入后 open(doc) 会把 doc.id 写入包内 store
  const loaded = await waitFor(
    () => (mmMod.useMindMapStore.getState() as unknown as { doc?: { id?: string } }).doc?.id === ctx.embedId,
    10000,
  )
  // 清除默认选中态：包初始化会默认选中根节点，选中描边与连线端点圆点
  // 会渲染进只读预览（Konva 画布内容，无法用 CSS 隐藏），必须在 store 层清掉
  const clearSelection = () => {
    try {
      const st = mmMod.useMindMapStore.getState() as unknown as {
        selectedId?: unknown
        selectedIds?: unknown[]
      }
      if (st.selectedId !== null || (Array.isArray(st.selectedIds) && st.selectedIds.length > 0)) {
        ;(mmMod.useMindMapStore.setState as unknown as (p: Record<string, unknown>) => void)({
          selectedId: null,
          selectedIds: [],
        })
      }
    } catch {
      // store 结构变化时静默跳过
    }
  }
  if (loaded) {
    setTimeout(clearSelection, 300)
    setTimeout(clearSelection, 1200)
  }
  return loaded ? 'ok' : 'ok'
}

/** pptx：读后端 Presentation → 注入封闭存储后端 → 挂载（bootDocId=embedId）→ 等 docId 信号 */
async function bootPptx(ctx: BootContext): Promise<BootOutcome> {
  const [pptxMod, { parseEmbedContent }, { getEmbedData }, { loadEmbedStyles }] = await Promise.all([
    import('@eflink-tech/pptx'),
    import('../../services/embedStorage/core'),
    import('../../api/wiki'),
    import('../../services/embedStorage/styles'),
  ])
  const data = await getEmbedData(ctx.nodeId, ctx.embedId)
  const parsed = parseEmbedContent(data.content) as PptxPresentation | null
  // 空内容或无幻灯片视为空文档
  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) return 'empty'
  // 封闭存储后端：get 恒返回本文档记录，写操作空实现
  pptxMod.setPptxStorageBackend({
    get: async () => ({
      id: ctx.embedId,
      name: data.title || '未命名演示',
      presentation: parsed,
      createdAt: data.updatedAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
    }),
    put: async () => {},
    remove: async () => {},
    list: async () => [],
  })
  const removeStyle = loadEmbedStyles('pptx')
  ctx.registerCleanup(removeStyle)
  ctx.setReady()
  // PptxEditor 启动载入后 loadDocument 会把 docId 写为 bootDocId
  await waitFor(
    () => (pptxMod.useEditorStore.getState() as unknown as { docId?: string }).docId === ctx.embedId,
    10000,
  )
  return 'ok'
}

/** word：预载判空 → storage prop 注入（chrome 经组件 props 全关）→ 挂载 → 等 onDocLoaded */
async function bootWord(ctx: BootContext): Promise<BootOutcome> {
  const [{ createWordStorage }, wordMod, { loadEmbedStyles }] = await Promise.all([
    import('../../services/embedStorage/word'),
    import('@eflink-tech/word'),
    import('../../services/embedStorage/styles'),
  ])
  const storage = createWordStorage(ctx.nodeId, ctx.embedId)
  // 包 StorageAdapter 声明为 load(id)：文档缺失（未创建/被删）按空文档处理
  const doc = await storage.load(ctx.embedId)
  if (!doc) return 'empty'
  // 与包内空白文档模板逐一比较（JSON 序列化在同构对象上顺序稳定）
  const blank = JSON.stringify(doc.content ?? null) === JSON.stringify(wordMod.EMPTY_DOC_CONTENT)
  if (blank) return 'empty'
  ctx.extraRef.current = storage
  const removeStyle = loadEmbedStyles('word')
  ctx.registerCleanup(removeStyle)
  ctx.setReady()
  await waitFor(() => ctx.loadFlag.done, 10000)
  return 'ok'
}

/** excel：预载快照判空 → storage prop 注入（工具栏/公式栏 props 关）→ 挂载 → 等 onDocLoaded */
async function bootExcel(ctx: BootContext): Promise<BootOutcome> {
  const [{ createExcelStorage }, { loadEmbedStyles }] = await Promise.all([
    import('../../services/embedStorage/excel'),
    import('../../services/embedStorage/styles'),
  ])
  const storage = createExcelStorage(ctx.nodeId, ctx.embedId)
  // 包 StorageAdapter 声明为 load(id)：文档缺失（未创建/被删）按空文档处理
  const doc = await storage.load(ctx.embedId)
  if (!doc) return 'empty'
  // 空表判定：所有 sheet 均无任何单元格数据
  const sheets = Object.values(doc.snapshot?.sheets ?? {})
  const hasCells = sheets.some(
    (s) => s.cellData && Object.values(s.cellData).some((row) => row && Object.keys(row).length > 0),
  )
  if (!hasCells) return 'empty'
  ctx.extraRef.current = storage
  const removeStyle = loadEmbedStyles('excel')
  ctx.registerCleanup(removeStyle)
  ctx.setReady()
  await waitFor(() => ctx.loadFlag.done, 10000)
  return 'ok'
}

/** 按类型分发启动 */
function bootPreview(type: PreviewableEmbedType, ctx: BootContext): Promise<BootOutcome> {
  switch (type) {
    case 'draw':
      return bootDraw(ctx)
    case 'mindmap':
      return bootMindmap(ctx)
    case 'pptx':
      return bootPptx(ctx)
    case 'word':
      return bootWord(ctx)
    case 'excel':
      return bootExcel(ctx)
  }
}

/* ───────────── 预览正文（内联/弹窗共用） ───────────── */

interface EmbedPreviewBodyProps {
  type: PreviewableEmbedType
  nodeId: number
  embedId: string
  /** 预览容器高度类：内联=固定高度；弹窗=填满（h-full） */
  hostClassName?: string
  /** 弹窗模式：true=空文档渲染 renderEmpty 占位 */
  modal?: boolean
  /** 空文档占位（modal 模式用） */
  renderEmpty?: () => React.ReactNode
  /** 不可用回落（内联模式=紧凑卡片；modal 模式可传错误占位） */
  fallback?: React.ReactNode
}

/** 预览正文：启动 → 只读画布 / 空占位 / 回落 */
export function EmbedPreviewBody({
  type,
  nodeId,
  embedId,
  hostClassName,
  renderEmpty,
  fallback,
}: EmbedPreviewBodyProps) {
  // boot=准备中 ready=画布就绪 empty=空文档 fallback=不可用
  const [phase, setPhase] = useState<'boot' | 'ready' | 'empty' | 'fallback'>('boot')
  const releaseRef = useRef<(() => void) | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const extraRef = useRef<unknown>(null)
  const loadFlagRef = useRef({ done: false })

  useEffect(() => {
    let alive = true
    let guarded = false
    loadFlagRef.current = { done: false }
    extraRef.current = null
    const setReady = () => {
      if (alive) setPhase('ready')
    }
    const registerCleanup = (fn: () => void) => {
      if (alive) cleanupRef.current = fn
      else fn() // 竞态：注册前已卸载，立即清理
    }
    void (async () => {
      const release = await acquireTurn(type)
      if (!alive) {
        release()
        return
      }
      releaseRef.current = release
      acquireKeyGuard()
      guarded = true
      try {
        const outcome = await bootPreview(type, {
          nodeId,
          embedId,
          bodyEl: bodyRef.current,
          loadFlag: loadFlagRef.current,
          extraRef,
          setReady,
          registerCleanup,
        })
        if (!alive) return
        if (outcome === 'empty') setPhase('empty')
      } catch {
        if (alive) setPhase('fallback')
      } finally {
        // 队列启动位用毕即释放（编辑器保持挂载；全局存储此后不再被本预览读取）
        releaseRef.current = null
        release()
      }
    })()
    return () => {
      alive = false
      // 卸载：释放排队中的启动位、移除注入样式、卸下键盘守卫
      releaseRef.current?.()
      releaseRef.current = null
      cleanupRef.current?.()
      cleanupRef.current = null
      if (guarded) releaseKeyGuard()
    }
  }, [type, nodeId, embedId])

  // 不可用：回落（内联=紧凑卡片；弹窗=错误占位）
  if (phase === 'fallback') {
    return <>{fallback ?? null}</>
  }
  // 空文档：有自定义占位则渲染（弹窗/内联一致），否则回落紧凑卡片
  if (phase === 'empty') {
    if (renderEmpty) return <>{renderEmpty()}</>
    return <>{fallback ?? null}</>
  }

  return (
    <div ref={bodyRef} className={cn('relative bg-white', hostClassName)}>
      {phase === 'boot' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          <Spinner size={20} />
        </div>
      )}
      {phase === 'ready' && (
        <div className={cn('wiki-embed-preview__host absolute inset-0 overflow-hidden', `wiki-preview-${type}`)}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner size={20} />
              </div>
            }
          >
            {type === 'draw' && <DrawEditorLazy key={embedId} />}
            {type === 'mindmap' && <MindMapEditorLazy key={embedId} bootDocId={embedId} />}
            {type === 'pptx' && <PptxEditorLazy key={embedId} bootDocId={embedId} />}
            {type === 'word' && (
              <WordEditorLazy
                key={embedId}
                docId={embedId}
                storage={extraRef.current as WordStorageAdapter}
                branding={false}
                showToolbar={false}
                showCatalog={false}
                showStatusBar={false}
                onDocLoaded={() => {
                  loadFlagRef.current.done = true
                }}
                onDocError={(err: unknown) => console.warn('word 预览加载失败', err)}
              />
            )}
            {type === 'excel' && (
              <SheetEditorLazy
                key={embedId}
                docId={embedId}
                storage={extraRef.current as ExcelStorageAdapter}
                branding={false}
                showToolbar={false}
                showFormulaBar={false}
                onDocLoaded={() => {
                  loadFlagRef.current.done = true
                }}
                onDocError={(err: unknown) => console.warn('excel 预览加载失败', err)}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  )
}

/* ───────────── 内联预览卡片（阅读态 draw / mindmap） ───────────── */

interface EmbedPreviewProps {
  type: PreviewableEmbedType
  nodeId: number
  embedId: string
  title: string
  /** 头部「预览」按钮 / 双击画布区回调：弹出大号预览弹窗 */
  onPreview: () => void
  /** 编辑态：头部按钮显示「打开编辑」并跳全屏编辑器（不传则按阅读态渲染） */
  editable?: boolean
  onOpenEditor?: () => void
  /** 空文档占位（内联模式默认回落紧凑卡片，传入后渲染轻量占位） */
  renderEmpty?: () => React.ReactNode
  /** 预览不可用（加载失败/空文档）时渲染的兜底内容（紧凑卡片） */
  fallback: React.ReactNode
}

/** 嵌入块内联只读预览（阅读/编辑态嵌在正文里，固定高度） */
export default function EmbedPreview({
  type,
  nodeId,
  embedId,
  title,
  onPreview,
  editable,
  onOpenEditor,
  renderEmpty,
  fallback,
}: EmbedPreviewProps) {
  const label = type === 'draw' ? '流程图' : '思维导图'

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* 顶部小标题栏：类型 · 标题 + 「预览」按钮 */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-600">
          <span>{label}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-slate-500">{title || '未命名嵌入'}</span>
        </p>
        {editable && onOpenEditor ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
            onClick={onOpenEditor}
          >
            打开编辑
          </button>
        ) : (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
            onClick={onPreview}
          >
            <Eye size={12} />
            预览
          </button>
        )}
      </div>

      {/* 预览区：双击打开大号预览弹窗 */}
      <div onDoubleClick={onPreview}>
        <EmbedPreviewBody
          type={type}
          nodeId={nodeId}
          embedId={embedId}
          hostClassName="h-[clamp(380px,50vh,520px)] cursor-zoom-in"
          fallback={fallback}
          renderEmpty={renderEmpty}
        />
      </div>
    </div>
  )
}
