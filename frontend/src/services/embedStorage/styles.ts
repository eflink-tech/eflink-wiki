/**
 * 五个编辑器包的样式装载。
 *
 * 采用「运行时注入 <style> + 卸载时移除」而不是静态 import 包内 styles.css：
 * 各包 styles.css 内含一整套独立 Tailwind 构建，SPA 常驻注入会在返回知识库
 * 页面后残留第二套工具类，压垮主应用布局（主站 officeStorage 的既有教训）。
 * 嵌入编辑器是全屏覆盖层，挂载期间第二套样式只影响本页；卸载即移除，无残留。
 * 包内 styles.css 是各包「可独立运行」模式的完整样式（含非 Tailwind 规则），
 * 无需主应用 @source 扫描包源码。用 ?raw 取文本（比 ?url 的资源引用在构建
 * 产物中更可控、确定性更强），代价是懒加载 chunk 体积增大（共约 0.6MB）。
 */
import drawCss from '@eflink-tech/draw/styles.css?raw'
import excelCss from '@eflink-tech/excel/styles.css?raw'
import mindmapCss from '@eflink-tech/mindmap/styles.css?raw'
import pptxCss from '@eflink-tech/pptx/styles.css?raw'
import wordCss from '@eflink-tech/word/styles.css?raw'
import type { EmbedType } from './core'

/** 各类型编辑器包的样式文本（构建期以字符串内联进各自懒加载 chunk） */
const EMBED_STYLE_TEXT: Record<EmbedType, string> = {
  word: wordCss,
  excel: excelCss,
  pptx: pptxCss,
  draw: drawCss,
  mindmap: mindmapCss,
}

/** 注入标记：卸载时只移除本模块注入的 <style> */
const STYLE_ATTR = 'data-wiki-embed-style'

/** 注入对应类型的编辑器样式，返回卸载函数（幂等：重复注入前先清理旧节点） */
export function loadEmbedStyles(type: EmbedType): () => void {
  removeEmbedStyles(type)
  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, type)
  style.textContent = EMBED_STYLE_TEXT[type]
  document.head.appendChild(style)
  return () => removeEmbedStyles(type)
}

/** 移除指定类型（或不传时全部）由本模块注入的样式 */
export function removeEmbedStyles(type?: EmbedType): void {
  const selector = type ? `style[${STYLE_ATTR}="${type}"]` : `style[${STYLE_ATTR}]`
  document.querySelectorAll(selector).forEach((el) => el.remove())
}
