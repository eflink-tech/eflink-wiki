/**
 * 媒体类块节点集合（均为 block 级原子节点 + React NodeView）：
 * - attachment：附件卡片（文件图标 + 文件名 + 大小 + 预览/下载），支持在线预览
 *   （图片/视频/音频/pdf/docx/xlsx/pptx/文本 → AttachmentPreviewModal，编辑与阅读态共用）
 * - wikiVideo：HTML5 视频播放器（上传或外链 mp4/webm 等）
 * - wikiAudio：HTML5 音频播放器（上传或外链 mp3/wav 等）
 * - webEmbed：网页内嵌（iframe + sandbox；目标站拒绝内嵌时提供新窗口打开兜底）
 */
import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import {
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileVideo2,
  Globe,
  type LucideIcon,
} from 'lucide-react'
import AttachmentPreviewModal, { downloadAttachment } from './AttachmentPreviewModal'

/* ==================== 附件图标辅助 ==================== */

/** 按扩展名取展示图标与配色 */
function fileMeta(name: string): { icon: LucideIcon; badge: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['zip', '7z', 'rar', 'tar', 'gz'].includes(ext)) return { icon: FileArchive, badge: 'bg-amber-50 text-amber-600' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: FileSpreadsheet, badge: 'bg-emerald-50 text-emerald-600' }
  if (['doc', 'docx', 'txt', 'md', 'pdf'].includes(ext)) return { icon: FileText, badge: 'bg-blue-50 text-blue-600' }
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return { icon: FileVideo2, badge: 'bg-violet-50 text-violet-600' }
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) return { icon: FileAudio2, badge: 'bg-pink-50 text-pink-600' }
  if (['html', 'css', 'js', 'ts', 'json', 'xml', 'yaml', 'yml'].includes(ext)) return { icon: FileCode2, badge: 'bg-sky-50 text-sky-600' }
  return { icon: File, badge: 'bg-slate-100 text-slate-500' }
}

/** 字节数 → 可读大小 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** 原子块选中高亮（React NodeView 外层会带 ProseMirror-selectednode） */
function selectedRing(cls: string): string {
  return cls
}

/* ==================== attachment 附件 ==================== */

function AttachmentNodeView({ node }: NodeViewProps) {
  const { url, name, size } = node.attrs as { url: string; name: string; size: number | null }
  const [previewOpen, setPreviewOpen] = useState(false)
  const meta = fileMeta(name)
  const Icon = meta.icon
  return (
    <NodeViewWrapper
      className={selectedRing('wiki-attachment group my-3')}
      data-attachment-name={name}
    >
      {/* 点击卡片默认预览；下载走右侧明确的下载按钮 */}
      <div
        role="button"
        tabIndex={0}
        title="点击在线预览"
        className="flex max-w-md cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-300"
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPreviewOpen(true)
          }
        }}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.badge}`}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800 transition-colors group-hover:text-blue-600 group-hover:underline group-hover:decoration-blue-300 group-hover:underline-offset-2">
            {name}
          </span>
          {formatFileSize(size) && (
            <span className="mt-0.5 block text-[11px] text-slate-400">{formatFileSize(size)}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span
            role="button"
            tabIndex={-1}
            title="在线预览"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation()
              setPreviewOpen(true)
            }}
          >
            <Eye size={15} />
          </span>
          <span
            role="button"
            tabIndex={-1}
            title="下载"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation()
              void downloadAttachment(url, name)
            }}
          >
            <Download size={15} />
          </span>
        </span>
      </div>
      {previewOpen && (
        <AttachmentPreviewModal url={url} name={name} size={size} onClose={() => setPreviewOpen(false)} />
      )}
    </NodeViewWrapper>
  )
}

export const Attachment = Node.create({
  name: 'attachment',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-url'),
        renderHTML: (attributes) => ({ 'data-attachment-url': attributes.url }),
      },
      name: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-attachment-name'),
        renderHTML: (attributes) => ({ 'data-attachment-name': attributes.name }),
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-attachment-size')
          const n = raw === null ? NaN : Number(raw)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attributes) =>
          attributes.size === null ? {} : { 'data-attachment-size': String(attributes.size) },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-attachment': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView)
  },

  addCommands() {
    return {
      insertAttachment:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

/* ==================== wikiVideo 视频 ==================== */

function VideoNodeView({ node }: NodeViewProps) {
  const { src } = node.attrs as { src: string }
  return (
    <NodeViewWrapper className={selectedRing('wiki-video my-3')}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm">
        <video src={src} controls preload="metadata" className="block max-h-[480px] w-full" />
      </div>
    </NodeViewWrapper>
  )
}

export const WikiVideo = Node.create({
  name: 'wikiVideo',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => ({ src: attributes.src }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-wiki-video]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-wiki-video': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView)
  },

  addCommands() {
    return {
      insertWikiVideo:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

/* ==================== wikiAudio 音频 ==================== */

function AudioNodeView({ node }: NodeViewProps) {
  const { src } = node.attrs as { src: string }
  return (
    <NodeViewWrapper className={selectedRing('wiki-audio my-3')}>
      <div className="flex max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
          <FileAudio2 size={17} />
        </span>
        <audio src={src} controls preload="metadata" className="h-9 w-full min-w-0" />
      </div>
    </NodeViewWrapper>
  )
}

export const WikiAudio = Node.create({
  name: 'wikiAudio',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => ({ src: attributes.src }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-wiki-audio]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-wiki-audio': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView)
  },

  addCommands() {
    return {
      insertWikiAudio:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

/* ==================== webEmbed 网页内嵌 ==================== */

function WebEmbedNodeView({ node }: NodeViewProps) {
  const { src } = node.attrs as { src: string }
  return (
    <NodeViewWrapper className={selectedRing('wiki-web-embed my-3')}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"
          contentEditable={false}
        >
          <Globe size={14} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{src}</span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
            title="在新窗口打开（目标站禁止内嵌时用这个）"
          >
            <ExternalLink size={12} />
            新窗口打开
          </a>
        </div>
        <iframe
          src={src}
          // 不给 allow-same-origin：内嵌的是外部不可信内容，禁掉对自身源 storage 的访问
          sandbox="allow-scripts allow-popups allow-forms"
          loading="lazy"
          className="block h-[360px] w-full border-0 bg-white"
        />
        <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400" contentEditable={false}>
          若上方空白，说明目标网站禁止被内嵌，请点击右上角「新窗口打开」
        </p>
      </div>
    </NodeViewWrapper>
  )
}

export const WebEmbed = Node.create({
  name: 'webEmbed',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-web-embed-src'),
        renderHTML: (attributes) => ({ 'data-web-embed-src': attributes.src }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-web-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-web-embed': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebEmbedNodeView)
  },

  addCommands() {
    return {
      insertWebEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

/* ==================== 命令类型声明 ==================== */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiMediaBlocks: {
      /** 插入附件卡片（url 由上传接口返回） */
      insertAttachment: (attrs: { url: string; name: string; size: number | null }) => ReturnType
      /** 插入视频（上传或外链地址） */
      insertWikiVideo: (attrs: { src: string }) => ReturnType
      /** 插入音频（上传或外链地址） */
      insertWikiAudio: (attrs: { src: string }) => ReturnType
      /** 插入网页内嵌 */
      insertWebEmbed: (attrs: { src: string }) => ReturnType
    }
  }
}
