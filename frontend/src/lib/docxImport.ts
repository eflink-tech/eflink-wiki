/**
 * .docx → HTML（供 Tiptap insertContent 使用）。
 *
 * 用 mammoth 做结构化转换：标题/段落/列表/表格/加粗斜体下划线/图片等。
 * 图片默认会被 mammoth 转成 base64 data URI，直接插入会让正文 JSON 急剧膨胀，
 * 因此这里改为上传到本站 /upload，失败时回退 data URI 保证内容不丢。
 *
 * 不支持：页眉页脚、分栏、文本框、SmartArt、修订/批注等版式信息（mammoth 本身限制）。
 */
import { uploadFile } from '../components/editor/upload'

/** 导入文件上限：与附件上传保持同一量级，避免浏览器解析卡死 */
export const DOCX_IMPORT_MAX_BYTES = 30 * 1024 * 1024

/** 判断是否为 .docx（仅按扩展名 + MIME，.doc 旧格式不支持） */
export function isDocxFile(file: File): boolean {
  return /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType || 'application/octet-stream' })
}

/** 转换 docx 为 HTML；图片尽量上传成本站 URL，上传失败回退 data URI */
export async function docxToHtml(file: File): Promise<string> {
  if (!isDocxFile(file)) {
    throw new Error('仅支持 .docx 文件（旧版 .doc 请先在 Word 中另存为 .docx）')
  }
  if (file.size > DOCX_IMPORT_MAX_BYTES) {
    throw new Error(`文件超过 ${Math.round(DOCX_IMPORT_MAX_BYTES / 1024 / 1024)}MB，请拆分后再导入`)
  }

  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64')
        const contentType = image.contentType || 'image/png'
        const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
        try {
          const blob = base64ToBlob(base64, contentType)
          const name = `docx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const url = await uploadFile(new File([blob], name, { type: contentType }))
          return { src: url }
        } catch {
          // 上传失败不阻断导入，退化为内联图片
          return { src: `data:${contentType};base64,${base64}` }
        }
      }),
    },
  )

  const html = result.value.trim()
  if (!html) throw new Error('文档内容为空，未导入任何内容')
  return html
}
