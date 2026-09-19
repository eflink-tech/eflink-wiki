/** 知识库页面导出 PDF：A4 竖版、截图后按页切片下载 */

export const PDF_PAGE_WIDTH_MM = 210
export const PDF_PAGE_HEIGHT_MM = 297
export const PDF_MARGIN_MM = 10
const MAX_CANVAS_SIDE = 16384
const MAX_CANVAS_AREA = 268435456
const CAPTURE_TIMEOUT_MS = 30_000

export function sanitizePdfBasename(name: string): string {
  const trimmed = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return trimmed || '未命名页面'
}

/** 在浏览器 canvas 上限内尽量接近 desired 倍率 */
export function pickCanvasScale(width: number, height: number, desired = 2): number {
  if (width <= 0 || height <= 0) return 1
  let scale = desired
  if (width * scale > MAX_CANVAS_SIDE) scale = MAX_CANVAS_SIDE / width
  if (height * scale > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / height)
  if (width * height * scale * scale > MAX_CANVAS_AREA) {
    scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / (width * height)))
  }
  return Math.max(0.05, scale)
}

export function layoutPdfPages(
  canvasWidth: number,
  canvasHeight: number,
  pageWidthMm = PDF_PAGE_WIDTH_MM,
  pageHeightMm = PDF_PAGE_HEIGHT_MM,
  marginMm = PDF_MARGIN_MM,
): { imgWidthMm: number; imgHeightMm: number; innerHeightMm: number; pageCount: number } {
  const innerWidthMm = pageWidthMm - marginMm * 2
  const innerHeightMm = pageHeightMm - marginMm * 2
  const imgWidthMm = innerWidthMm
  const imgHeightMm = canvasWidth > 0 ? (canvasHeight * imgWidthMm) / canvasWidth : 0
  const pageCount = Math.max(1, Math.ceil(imgHeightMm / Math.max(innerHeightMm, 1)))
  return { imgWidthMm, imgHeightMm, innerHeightMm, pageCount }
}

function isNoPrint(el: Element): boolean {
  return Boolean(el.closest?.('.no-print'))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(id)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(id)
        reject(err)
      },
    )
  })
}

/** 把页面 DOM 截成 A4 PDF Blob（动态加载 html2canvas-pro / jspdf，避免打进首屏） */
export async function captureElementPdf(el: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  const scale = pickCanvasScale(el.scrollWidth || el.clientWidth, el.scrollHeight || el.clientHeight)
  const canvas = await withTimeout(
    html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(el.scrollWidth, el.clientWidth, 1),
      windowHeight: Math.max(el.scrollHeight, el.clientHeight, 1),
      ignoreElements: (node) => isNoPrint(node),
    }),
    CAPTURE_TIMEOUT_MS,
    '导出超时，请缩短页面内容后重试',
  )
  if (canvas.width < 1 || canvas.height < 1) {
    throw new Error('页面内容为空，无法导出 PDF')
  }
  const { imgWidthMm, innerHeightMm, pageCount } = layoutPdfPages(canvas.width, canvas.height)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageHeightPx = canvas.width > 0 ? (innerHeightMm / imgWidthMm) * canvas.width : canvas.height
  for (let i = 0; i < pageCount; i++) {
    const sy = Math.round(i * pageHeightPx)
    const sliceH = Math.max(1, Math.min(Math.round(pageHeightPx), canvas.height - sy))
    if (sliceH <= 0) break
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceH
    const ctx = slice.getContext('2d')
    if (!ctx) throw new Error('无法创建 PDF 画布')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    const sliceHeightMm = (sliceH * imgWidthMm) / canvas.width
    if (i > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', PDF_MARGIN_MM, PDF_MARGIN_MM, imgWidthMm, sliceHeightMm)
  }
  return pdf.output('blob')
}
