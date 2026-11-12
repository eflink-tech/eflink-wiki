/**
 * ProseMirror JSON → 真 OOXML .docx（docx 库）。
 *
 * 覆盖 wiki 编辑器的主要块与行内 marks：
 * 标题 H1–H5、段落、加粗/斜体/下划线/删除线/颜色/高亮/字号/链接/行内代码、
 * 有序/无序/任务列表、引用、代码块、分割线、表格、图片、分栏/嵌入/附件等占位文本。
 *
 * 与旧实现的区别：不再把 HTML 包成 .doc，Word/WPS 打开不会提示格式不符，
 * 表格、列表、图片等都是原生 Word 对象。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { PMNode } from './markdown'

const DEFAULT_IMAGE_WIDTH = 480
const DEFAULT_IMAGE_HEIGHT = 320
const MAX_IMAGE_WIDTH = 600

const ORDERED_REFERENCE = 'wiki-ordered'

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

/** 统一节点类型名（兼容 snake_case） */
function norm(type: string | undefined): string {
  return (type ?? '').toLowerCase().replace(/_/g, '')
}

function markValue(node: PMNode, type: string): Record<string, unknown> | undefined {
  return node.marks?.find((m) => m.type === type)?.attrs ?? undefined
}

function hasMark(node: PMNode, type: string): boolean {
  return Boolean(node.marks?.some((m) => m.type === type))
}

/** 把 '#rrggbb' / '#RGB' 转成 docx 需要的六位十六进制 */
function toHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined
  const m = color.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return undefined
  const raw = m[1]
  return (raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw).toUpperCase()
}

function fontSizeHalfPoints(node: PMNode): number | undefined {
  const style = markValue(node, 'textStyle')
  const raw = style?.fontSize
  if (typeof raw !== 'string') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 2) : undefined
}

/** 图片 URL → ArrayBuffer（支持 data URI / 相对路径 / 同源静态资源） */
async function loadImageData(src: string): Promise<ArrayBuffer | null> {
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',')
      if (comma < 0) return null
      const meta = src.slice(5, comma)
      const body = src.slice(comma + 1)
      if (meta.includes(';base64')) {
        const binary = atob(body)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
      }
      return new TextEncoder().encode(decodeURIComponent(body)).buffer
    }
    const url = new URL(src, window.location.origin).toString()
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

function imageType(src: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const lower = src.toLowerCase()
  if (lower.includes('image/jpeg') || /\.jpe?g(\?|$)/.test(lower)) return 'jpg'
  if (lower.includes('image/gif') || /\.gif(\?|$)/.test(lower)) return 'gif'
  if (lower.includes('image/bmp') || /\.bmp(\?|$)/.test(lower)) return 'bmp'
  return 'png'
}

/** 文本节点 → TextRun（应用 marks） */
function textRuns(node: PMNode): (TextRun | ExternalHyperlink)[] {
  const text = node.text ?? ''
  if (!text) return []
  const highlight = markValue(node, 'highlight')
  const style = markValue(node, 'textStyle')
  const run = new TextRun({
    text,
    bold: hasMark(node, 'bold') || undefined,
    italics: hasMark(node, 'italic') || undefined,
    underline: hasMark(node, 'underline') ? {} : undefined,
    strike: hasMark(node, 'strike') || undefined,
    color: toHex(style?.color),
    size: fontSizeHalfPoints(node),
    font: hasMark(node, 'code') ? 'Consolas' : undefined,
    shading: highlight?.color
      ? { type: ShadingType.CLEAR, fill: toHex(highlight.color) ?? 'FFFF00' }
      : hasMark(node, 'code')
        ? { type: ShadingType.CLEAR, fill: 'F1F5F9' }
        : undefined,
  })
  const link = markValue(node, 'link')
  const href = typeof link?.href === 'string' ? link.href : undefined
  if (href) {
    return [
      new ExternalHyperlink({
        link: href,
        children: [run],
      }),
    ]
  }
  return [run]
}

/** 行内节点 → TextRun 列表（hardBreak 用 break，图片在段落层单独处理） */
function inlineRuns(nodes: PMNode[] | null | undefined): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = []
  for (const child of nodes ?? []) {
    const t = norm(child.type)
    if (t === 'text') out.push(...textRuns(child))
    else if (t === 'hardbreak') out.push(new TextRun({ break: 1 }))
    else out.push(...inlineRuns(child.content))
  }
  return out
}

/** 段落内的图片：单独成段插入（Word 行内图片也可，但与文本混排易错位） */
async function paragraphImages(node: PMNode): Promise<Paragraph[]> {
  const images = (node.content ?? []).filter((c) => norm(c.type) === 'image')
  const out: Paragraph[] = []
  for (const img of images) {
    const src = typeof img.attrs?.src === 'string' ? img.attrs.src : ''
    if (!src) continue
    const data = await loadImageData(src)
    if (!data) {
      out.push(new Paragraph({ children: [new TextRun({ text: String(img.attrs?.alt ?? '[图片]'), italics: true })] }))
      continue
    }
    const rawW = Number(img.attrs?.width)
    const rawH = Number(img.attrs?.height)
    let width = Number.isFinite(rawW) && rawW > 0 ? rawW : DEFAULT_IMAGE_WIDTH
    let height = Number.isFinite(rawH) && rawH > 0 ? rawH : DEFAULT_IMAGE_HEIGHT
    if (width > MAX_IMAGE_WIDTH) {
      height = Math.round((height * MAX_IMAGE_WIDTH) / width)
      width = MAX_IMAGE_WIDTH
    }
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data,
            type: imageType(src),
            transformation: { width, height },
          }),
        ],
      }),
    )
  }
  return out
}

function listParagraph(node: PMNode, level: number, ordered: boolean): Paragraph[] {
  const out: Paragraph[] = []
  const paragraphs = (node.content ?? []).filter((c) => norm(c.type) === 'paragraph')
  const nested = (node.content ?? []).filter((c) => ['bulletlist', 'orderedlist', 'tasklist'].includes(norm(c.type)))
  paragraphs.forEach((p, idx) => {
    const checkbox = norm(node.type) === 'taskitem' ? (node.attrs?.checked ? '☑ ' : '☐ ') : ''
    const runs = idx === 0 && checkbox ? [new TextRun({ text: checkbox }), ...inlineRuns(p.content)] : inlineRuns(p.content)
    out.push(
      new Paragraph({
        children: runs,
        ...(ordered ? { numbering: { reference: ORDERED_REFERENCE, level } } : { bullet: { level } }),
      }),
    )
  })
  for (const child of nested) {
    const t = norm(child.type)
    for (const item of child.content ?? []) out.push(...listParagraph(item, level + 1, t === 'orderedlist'))
  }
  return out
}

function tableCell(cell: PMNode, header: boolean): TableCell {
  const children: Paragraph[] = []
  for (const child of cell.content ?? []) {
    const t = norm(child.type)
    if (t === 'paragraph') children.push(new Paragraph({ children: inlineRuns(child.content) }))
    else if (t === 'heading') children.push(new Paragraph({ children: inlineRuns(child.content) }))
    else children.push(new Paragraph({ children: inlineRuns([child]) }))
  }
  if (children.length === 0) children.push(new Paragraph({}))
  return new TableCell({
    children,
    shading: header ? { type: ShadingType.CLEAR, fill: 'F1F5F9' } : undefined,
  })
}

async function renderBlock(node: PMNode): Promise<(Paragraph | Table)[]> {
  const t = norm(node.type)
  const attrs = node.attrs ?? {}
  switch (t) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(attrs.level ?? 1) || 1)) - 1
      return [new Paragraph({ heading: HEADINGS[level], children: inlineRuns(node.content) })]
    }
    case 'paragraph': {
      const images = await paragraphImages(node)
      const text = inlineRuns((node.content ?? []).filter((c) => norm(c.type) !== 'image'))
      const out: (Paragraph | Table)[] = []
      if (text.length > 0 || images.length === 0) out.push(new Paragraph({ children: text }))
      out.push(...images)
      return out
    }
    case 'bulletlist':
    case 'orderedlist':
    case 'tasklist': {
      const ordered = t === 'orderedlist'
      const items = (node.content ?? []).flatMap((item) => listParagraph(item, 0, ordered))
      return items
    }
    case 'blockquote': {
      return (node.content ?? []).map(
        (child) =>
          new Paragraph({
            children: inlineRuns(child.content),
            indent: { left: 480 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: '94A3B8', space: 8 },
            },
          }),
      )
    }
    case 'codeblock': {
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return [
        new Paragraph({
          children: code.split('\n').flatMap((line, i) =>
            i === 0
              ? [new TextRun({ text: line, font: 'Consolas', size: 20 })]
              : [new TextRun({ text: line, font: 'Consolas', size: 20, break: 1 })],
          ),
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
        }),
      ]
    }
    case 'horizontalrule': {
      return [
        new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 1 } },
        }),
      ]
    }
    case 'table': {
      const rows = (node.content ?? []).filter((r) => norm(r.type) === 'tablerow')
      const tableRows = rows.map(
        (row) =>
          new TableRow({
            children: (row.content ?? []).map((cell) =>
              tableCell(cell, norm(cell.type) === 'tableheader'),
            ),
          }),
      )
      return [
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ]
    }
    case 'image': {
      return paragraphImages({ type: 'paragraph', content: [node] })
    }
    case 'embedcard': {
      return [
        new Paragraph({
          children: [new TextRun({ text: `[嵌入] ${String(attrs.title ?? '')} (${String(attrs.type ?? '')})`, italics: true })],
        }),
      ]
    }
    case 'attachment': {
      return [
        new Paragraph({
          children: [new TextRun({ text: `[附件] ${String(attrs.name ?? '')} (${String(attrs.url ?? '')})` })],
        }),
      ]
    }
    case 'wikivideo':
    case 'video': {
      return [new Paragraph({ children: [new TextRun({ text: `[视频] ${String(attrs.src ?? '')}` })] })]
    }
    case 'wikiaudio':
    case 'audio': {
      return [new Paragraph({ children: [new TextRun({ text: `[音频] ${String(attrs.src ?? '')}` })] })]
    }
    case 'webembed': {
      return [new Paragraph({ children: [new TextRun({ text: `[网页] ${String(attrs.src ?? '')}` })] })]
    }
    case 'pageref': {
      return [new Paragraph({ children: [new TextRun({ text: `[子页面] ${String(attrs.title ?? '')}` })] })]
    }
    case 'columns': {
      const out: (Paragraph | Table)[] = []
      for (const col of node.content ?? []) {
        for (const child of col.content ?? []) out.push(...(await renderBlock(child)))
      }
      return out
    }
    default: {
      const out: (Paragraph | Table)[] = []
      for (const child of node.content ?? []) out.push(...(await renderBlock(child)))
      return out
    }
  }
}

/** ProseMirror JSON 字符串 → .docx Blob */
export async function buildDocxBlob(docJson: string, title: string): Promise<Blob> {
  let root: PMNode
  try {
    root = JSON.parse(docJson) as PMNode
  } catch {
    throw new Error('页面内容格式不正确，无法导出 Word')
  }
  const blocks: (Paragraph | Table)[] = []
  for (const node of root.content ?? []) blocks.push(...(await renderBlock(node)))

  const doc = new Document({
    title,
    creator: 'eflink-wiki',
    numbering: {
      config: [
        {
          reference: ORDERED_REFERENCE,
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4，单位 twip
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title, bold: true })],
          }),
          ...(blocks.length > 0 ? blocks : [new Paragraph({})]),
        ],
      },
    ],
  })
  return Packer.toBlob(doc)
}
