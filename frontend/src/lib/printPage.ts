/**
 * 打印 / 另存为 PDF：把页面正文克隆到独立打印窗口，由浏览器分页。
 *
 * 与截图 PDF 的区别：输出的是可选文字、真实分页，字体与表格不会在页边界被切断。
 * 样式表整份复制（同源 <link> 直接引用），保留 wiki 正文排版与 Tailwind 布局。
 * 纸张 / 方向 / 页边距 / 页眉页脚 / 页码通过 @page 规则控制（Chromium 支持 margin box）。
 */

export type PrintPaper = 'A4' | 'A3' | 'Letter'
export type PrintOrientation = 'portrait' | 'landscape'

export interface PrintOptions {
  paper: PrintPaper
  orientation: PrintOrientation
  /** 页边距（mm），四边一致 */
  marginMm: number
  /** 页眉：标题 + 打印日期 */
  header: boolean
  /** 页脚：自定义文字 */
  footer: boolean
  /** 页码：第 x 页 / 共 y 页 */
  pageNumbers: boolean
  /** 页脚文字（footer 开启时生效） */
  footerText: string
}

export const PRINT_MARGIN_CHOICES = [10, 16, 20, 25] as const

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paper: 'A4',
  orientation: 'portrait',
  marginMm: 16,
  header: true,
  footer: false,
  pageNumbers: true,
  footerText: '易飞知识库',
}

/** CSS 字符串字面量转义（页眉/页脚文字进入 @page margin box） */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
}

function buildPageCss(title: string, options: PrintOptions): string {
  const date = new Date().toLocaleDateString('zh-CN')
  const top = options.header
    ? `
    @top-left { content: ${cssString(title)}; font-size: 9pt; color: #6b7280; }
    @top-right { content: ${cssString(date)}; font-size: 9pt; color: #6b7280; }`
    : ''
  const bottom = `
    ${options.pageNumbers ? `@bottom-center { content: "第 " counter(page) " 页 / 共 " counter(pages) " 页"; font-size: 9pt; color: #6b7280; }` : ''}
    ${options.footer ? `@bottom-left { content: ${cssString(options.footerText)}; font-size: 9pt; color: #6b7280; }` : ''}`
  return `
  @page {
    size: ${options.paper} ${options.orientation};
    margin: ${options.marginMm}mm;${top}${bottom}
  }`
}

const PRINT_CSS = `
  html, body { background: #fff !important; }
  body { margin: 0; }
  .print-root { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .print-root .no-print { display: none !important; }
  img, svg, canvas { max-width: 100% !important; height: auto !important; }
  table { width: 100% !important; border-collapse: collapse; page-break-inside: auto; }
  tr, td, th { page-break-inside: avoid; }
  thead { display: table-header-group; }
  h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
  pre, blockquote { page-break-inside: avoid; break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
`

function collectStyles(doc: Document): string {
  const parts: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      const rules = sheet.cssRules
      if (rules) {
        parts.push(Array.from(rules).map((r) => r.cssText).join('\n'))
        continue
      }
    } catch {
      // 跨域样式表（字体等）读不到 cssRules，回退为 <link>
    }
    const owner = sheet.ownerNode as HTMLLinkElement | null
    if (owner?.tagName === 'LINK' && owner.href) {
      parts.push(`@import url("${owner.href}");`)
    }
  }
  return parts.join('\n')
}

/** 等待打印窗口里的图片加载完成（最多等 3 秒，超时也继续打印） */
function waitForImages(win: Window): Promise<void> {
  const pending = Array.from(win.document.images).filter((img) => !img.complete)
  if (pending.length === 0) return Promise.resolve()
  const loaded = Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  )
  return Promise.race<void>([
    loaded.then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
  ])
}

/**
 * 打开打印窗口。调用后浏览器弹出打印对话框，用户可选择打印机或「另存为 PDF」。
 * 返回 false 表示弹窗被浏览器拦截。
 */
export function printElement(
  el: HTMLElement,
  title: string,
  options: PrintOptions = DEFAULT_PRINT_OPTIONS,
): boolean {
  const win = window.open('', '_blank', 'width=1024,height=768')
  if (!win) return false

  const styles = collectStyles(document)
  const escapedTitle = title.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c)
  const content = el.outerHTML.replace(/^<div/, '<div class="print-root"')
  win.document.open()
  win.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />` +
      `<title>${escapedTitle}</title>` +
      `<style>${styles}\n${buildPageCss(title, options)}\n${PRINT_CSS}</style>` +
      `</head><body>${content}</body></html>`,
  )
  win.document.close()

  void waitForImages(win).then(() => {
    win.focus()
    win.print()
    // 打印对话框关闭后再关窗口；部分浏览器 print() 会阻塞，用 afterprint 兜底
    win.addEventListener('afterprint', () => win.close(), { once: true })
    window.setTimeout(() => {
      if (!win.closed) win.close()
    }, 60_000)
  })
  return true
}
