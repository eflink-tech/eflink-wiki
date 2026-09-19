/**
 * 全屏嵌入编辑器页（路由 /app/space/:spaceId/page/:nodeId/embed/:embedId?type=xx）。
 * 顶栏：返回知识库页面 + 嵌入标题 + 类型徽标 + 保存状态；正文按 ?type= 渲染对应
 * 编辑器包组件，读写经由 embedStorage 适配器（GET/PUT /api/wiki/nodes/{nodeId}/embeds/{embedId}）。
 * 五个编辑器包与样式均按类型动态加载（各自独立 chunk，互不拖累）。
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getEmbedData } from '../../api/wiki'
import { getPublicConfig } from '../../api/auth'
import { Spinner } from '../../components/Loading'
import { toast } from '../../components/Toast'
import {
  isSupportedEmbedType,
  prepareEmbedEditor,
} from '../../services/embedStorage'
import { loadEmbedStyles } from '../../services/embedStorage/styles'
import type { EmbedType } from '../../services/embedStorage'
import type { StorageAdapter as WordStorageAdapter } from '@eflink-tech/word'
import type { StorageAdapter as ExcelStorageAdapter } from '@eflink-tech/excel'

// 五个编辑器组件按类型懒加载（包体积大，必须独立分包）
const WordEditor = lazy(() => import('@eflink-tech/word').then((m) => ({ default: m.WordEditor })))
const SheetEditor = lazy(() => import('@eflink-tech/excel').then((m) => ({ default: m.SheetEditor })))
const ExcelToastHost = lazy(() => import('@eflink-tech/excel').then((m) => ({ default: m.ToastHost })))
const PptxEditor = lazy(() => import('@eflink-tech/pptx').then((m) => ({ default: m.PptxEditor })))
const DrawEditor = lazy(() => import('@eflink-tech/draw').then((m) => ({ default: m.DrawEditor })))
const MindMapEditor = lazy(() => import('@eflink-tech/mindmap').then((m) => ({ default: m.MindMapEditor })))

type BootState = 'loading' | 'ready' | 'error'

/** 格式化「已保存」时间（HH:mm） */

export default function EmbedEditorPage() {
  const params = useParams()
  const spaceId = params.spaceId
  const nodeId = params.nodeId
  const embedId = params.embedId
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const embedType: EmbedType | null = isSupportedEmbedType(typeParam) ? typeParam : null

  // 返回按钮开放配置（业务系统集成控制）：
  // 优先级 URL 参数 embedBack > 服务端配置 embedBackHref > 默认（返回知识库页面的编辑态 /edit）
  // embedBackShow=false 时完全不注入返回地址，包顶栏不渲染返回箭头
  const [embedBack, setEmbedBack] = useState<{ show: boolean; href: string | null }>({
    show: true,
    href: null,
  })
  useEffect(() => {
    let alive = true
    void getPublicConfig()
      .then((cfg) => {
        if (alive) setEmbedBack({ show: cfg.embedBackShow !== false, href: cfg.embedBackHref || null })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  // 业务系统可通过 URL 参数覆盖：?embedBack=<encodeURIComponent(地址)>
  const location = useLocation()
  const urlEmbedBack = new URLSearchParams(location.search).get('embedBack')
  const backTarget = urlEmbedBack || embedBack.href || `/app/space/${spaceId ?? ''}/page/${nodeId ?? ''}/edit`

  const [, setTitle] = useState('') // 标题仅用于预取校验，不再展示
  const [boot, setBoot] = useState<BootState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [storage, setStorage] = useState<unknown>(null)
  // 编辑器样式：按类型注入 <link>，离开页面即移除（避免包内第二套 Tailwind 残留压垮知识库布局）
  useEffect(() => {
    if (!embedType) return
    return loadEmbedStyles(embedType)
  }, [embedType])

  // 启动：预取嵌入标题（同时校验存在性/读取权限），再按类型注入存储（编辑器挂载即读存储）
  useEffect(() => {
    if (!embedType || !nodeId || !embedId) return
    let alive = true
    setBoot('loading')
    setStorage(null)
    setErrorMsg('')
    void (async () => {
      const data = await getEmbedData(Number(nodeId), embedId)
      const storageProp = await prepareEmbedEditor(embedType, Number(nodeId), embedId, backTarget, {
        injectBack: embedBack.show,
      })
      if (!alive) return
      setTitle(data.title)
      void data.title // 标题不再展示于页头（包工具栏为唯一顶部 UI），仅用于存在性校验
      setStorage(storageProp)
      setBoot('ready')
    })().catch((err: unknown) => {
      if (!alive) return
      setErrorMsg(err instanceof Error ? err.message : '嵌入文档加载失败')
      setBoot('error')
    })
    return () => {
      alive = false
    }
  }, [embedType, nodeId, embedId, backTarget])

  const goBack = () => navigate(backTarget)

  const renderBody = () => {
    // 类型不受支持：占位卡片
    if (!embedType || !embedId) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
          <TriangleAlert size={28} className="text-amber-400" />
          <p className="text-sm">暂不支持在知识库中编辑该类型的嵌入内容</p>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={goBack}
          >
            返回页面
          </button>
        </div>
      )
    }
    // 启动失败
    if (boot === 'error') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
          <TriangleAlert size={28} className="text-amber-400" />
          <p className="text-sm">{errorMsg}</p>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={goBack}
          >
            返回页面
          </button>
        </div>
      )
    }
    // 启动中（存储注入完成前编辑器不得挂载）
    if (boot !== 'ready') {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner size={22} />
        </div>
      )
    }
    const onDocError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : '文档加载失败，请稍后重试'
      setErrorMsg(msg)
      toast.error(msg)
    }
    switch (embedType) {
      case 'word':
        return (
          <Suspense fallback={<FullSpinner />}>
            <WordEditor
              docId={embedId}
              storage={storage as WordStorageAdapter}
              branding={false}
              guardUnload
              onDocError={onDocError}
            />
          </Suspense>
        )
      case 'excel':
        return (
          <Suspense fallback={<FullSpinner />}>
            <SheetEditor
              key={embedId}
              docId={embedId}
              storage={storage as ExcelStorageAdapter}
              branding={false}
              onDocError={onDocError}
            />
            <ExcelToastHost />
          </Suspense>
        )
      case 'pptx':
        return (
          <Suspense fallback={<FullSpinner />}>
            <PptxEditor key={embedId} bootDocId={embedId} />
          </Suspense>
        )
      case 'draw':
        return (
          <Suspense fallback={<FullSpinner />}>
            <DrawEditor key={embedId} />
          </Suspense>
        )
      case 'mindmap':
        return (
          <Suspense fallback={<FullSpinner />}>
            <MindMapEditor key={embedId} bootDocId={embedId} />
          </Suspense>
        )
      default:
        return null
    }
  }

  // 全屏编辑器（所有类型）：不渲染自绘页头，保留各包自带的顶部工具栏作为唯一顶部 UI，
  // 悬浮返回按钮 + 保存状态胶囊浮于其上
  return (
    <div className="wiki-fullscreen-editor fixed inset-0 z-[90] flex flex-col bg-white">
      {/* 编辑器主体（min-h-0 保证 flex 子项可正确收缩滚动） */}
      <div className="min-h-0 flex-1">{renderBody()}</div>
    </div>
  )
}

/** 编辑器分包加载中的整区占位 */
function FullSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={22} />
    </div>
  )
}
