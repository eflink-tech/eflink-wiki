/**
 * ProseMirror JSON 字符串 ↔ Markdown 双向转换（纯手写，零依赖）。
 *
 * 支持的块级节点：heading / paragraph / bulletList / orderedList / taskList(taskItem) /
 * listItem / blockquote / codeBlock / image（块级或内联）/ horizontalRule /
 * table(tableRow/tableCell/tableHeader) / embedCard / hardBreak /
 * attachment / video / audio / webEmbed / pageRef / columns(column，导出时平铺)。
 * 节点类型同时兼容 camelCase（bulletList）与 snake_case（bullet_list）两种命名。
 * 说明：加粗/斜体等内联 marks 不在本次范围内，统一按纯文本输出；表格单元格内的
 * 竖线会以 `\\|` 转义保真。
 */

/** 最小 ProseMirror 节点结构（仅声明转换用到的字段） */
export interface PMNode {
  type: string
  attrs?: Record<string, unknown> | null
  content?: PMNode[] | null
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> | null }[]
}

/** 统一节点类型名：转小写并去掉下划线，便于兼容两种命名风格 */
function norm(type: string): string {
  return type.toLowerCase().replace(/_/g, '')
}

/** 行内图片节点 → Markdown 图片语法 */
function imageMd(node: PMNode): string {
  const attrs = node.attrs ?? {}
  return `![${String(attrs.alt ?? '')}](${String(attrs.src ?? '')})`
}

/** 递归取一个（块/行内）节点的全部行内文本；hardBreak 转换行、image 转图片语法 */
function inlineText(node: PMNode): string {
  const parts: string[] = []
  for (const child of node.content ?? []) {
    const t = norm(child.type)
    if (t === 'hardbreak') parts.push('\n')
    else if (t === 'image') parts.push(imageMd(child))
    else if (t === 'text') parts.push(child.text ?? '')
    else parts.push(inlineText(child)) // 未知包装节点：递归取文本
  }
  return parts.join('')
}

/* ==================== JSON → Markdown ==================== */

/**
 * ProseMirror JSON 字符串 → Markdown。
 * 解析失败（非 JSON）时原样返回；空文档返回空字符串。
 */
export function jsonToMarkdown(doc: string): string {
  if (!doc) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(doc)
  } catch {
    return doc
  }
  const root = parsed as PMNode
  if (!root || typeof root !== 'object') return ''
  const lines = Array.isArray(root.content) ? renderBlocks(root.content) : []
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/** 渲染一组块级节点；块与块之间用一个空行分隔 */
function renderBlocks(nodes: PMNode[]): string[] {
  const out: string[] = []
  let first = true
  for (const node of nodes) {
    if (!first) out.push('')
    first = false
    out.push(...renderBlock(node, ''))
  }
  return out
}

/** 渲染单个块级节点，返回若干行文本（indent 为继承的缩进前缀） */
function renderBlock(node: PMNode, indent: string): string[] {
  const t = norm(node.type)
  const attrs = node.attrs ?? {}
  switch (t) {
    case 'heading': {
      // 标题：#/##/###...（级别收敛到 1~6）
      const level = Math.min(6, Math.max(1, Number(attrs.level ?? 1) || 1))
      return [indent + '#'.repeat(level) + ' ' + inlineText(node)]
    }
    case 'paragraph': {
      // 段落：hardBreak 产生的多行逐行输出；空段落不输出
      const text = inlineText(node)
      return text === '' ? [] : text.split('\n').map((l) => indent + l)
    }
    case 'bulletlist':
      return (node.content ?? []).map((item) => renderListItem(item, '- ', indent)).flat()
    case 'orderedlist': {
      // 有序列表：从 attrs.start 起编号
      let no = Number(attrs.start ?? 1) || 1
      return (node.content ?? []).map((item) => renderListItem(item, `${no++}. `, indent)).flat()
    }
    case 'tasklist':
      return (node.content ?? []).map((item) => renderTaskItem(item, indent)).flat()
    case 'blockquote': {
      // 引用块：内部块逐行加 "> " 前缀
      const inner = renderBlocks(node.content ?? [])
      return inner.map((l) => indent + (l === '' ? '>' : '> ' + l))
    }
    case 'codeblock': {
      // 代码块：``` 围栏，语言取 attrs.language
      const lang = String(attrs.language ?? attrs.lang ?? '')
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return [indent + '```' + lang, ...code.split('\n').map((l) => indent + l), indent + '```']
    }
    case 'horizontalrule':
      return [indent + '---']
    case 'image':
      return [indent + imageMd(node)]
    case 'table':
      return renderTable(node, indent)
    case 'embedcard': {
      // 嵌入卡片：块引用形式 > [嵌入] 标题 (类型)
      const title = String(attrs.title ?? '')
      const type = String(attrs.type ?? attrs.embedType ?? '')
      return [indent + `> [嵌入] ${title} (${type})`]
    }
    case 'attachment': {
      // 附件：文本形式 [附件] 文件名 (URL)
      const name = String(attrs.name ?? '')
      const url = String(attrs.url ?? '')
      return [indent + `[附件] ${name} (${url})`]
    }
    case 'wikivideo':
    case 'video':
      return [indent + `[视频](${String(attrs.src ?? '')})`]
    case 'wikiaudio':
    case 'audio':
      return [indent + `[音频](${String(attrs.src ?? '')})`]
    case 'webembed':
      return [indent + `[网页](${String(attrs.src ?? '')})`]
    case 'pageref': {
      // 子页面引用：[子页面] 标题 (#节点ID)
      const title = String(attrs.title ?? '')
      return [indent + `[子页面] ${title} (#${String(attrs.nodeId ?? '')})`]
    }
    case 'columns': {
      // 分栏导出为 Markdown 时平铺：各栏内容顺序输出，栏间空行分隔
      const lines: string[] = []
      for (const col of node.content ?? []) {
        if (lines.length > 0) lines.push('')
        lines.push(...renderBlocks(col.content ?? []))
      }
      return lines.map((l) => indent + l)
    }
    default:
      // 未知块级节点：尽力递归渲染其子块
      return renderBlocks(node.content ?? [])
  }
}

/** 渲染列表项：首行带标记，段落续行与嵌套列表对齐缩进 */
function renderListItem(item: PMNode, marker: string, indent: string): string[] {
  const pad = ' '.repeat(marker.length)
  const paras: string[] = []
  const nested: string[] = []
  for (const child of item.content ?? []) {
    const t = norm(child.type)
    if (t === 'bulletlist' || t === 'orderedlist' || t === 'tasklist') {
      // 嵌套列表：整体缩进到项文本之后
      nested.push(...renderBlock(child, indent + pad))
    } else {
      paras.push(inlineText(child))
    }
  }
  const lines: string[] = []
  paras
    .filter((p) => p !== '')
    .join('\n')
    .split('\n')
    .forEach((l, i) => lines.push(i === 0 ? indent + marker + l : indent + pad + l))
  lines.push(...nested)
  return lines
}

/** 渲染任务项：- [ ] / - [x]（checked 取自 attrs.checked） */
function renderTaskItem(item: PMNode, indent: string): string[] {
  const checked = item.attrs?.checked === true
  return renderListItem(item, checked ? '- [x] ' : '- [ ] ', indent)
}

/** 渲染管道表格；表头行（含 tableHeader）后插入 --- 分隔行 */
function renderTable(node: PMNode, indent: string): string[] {
  const lines: string[] = []
  const rows = (node.content ?? []).filter((r) => norm(r.type) === 'tablerow')
  rows.forEach((row, ri) => {
    const cells = (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((p) => inlineText(p))
        .join(' ')
        .replace(/\|/g, '\\|')
        .trim(),
    )
    lines.push(indent + '| ' + cells.join(' | ') + ' |')
    if (ri === 0 && (row.content ?? []).some((c) => norm(c.type) === 'tableheader')) {
      lines.push(indent + '| ' + cells.map(() => '---').join(' | ') + ' |')
    }
  })
  return lines
}

/* ==================== Markdown → JSON ==================== */

/** 列表行记录（解析中间态） */
interface ListRec {
  level: number
  kind: 'bullet' | 'ordered' | 'task'
  text: string
  checked: boolean
  order: number
}

/**
 * Markdown → ProseMirror JSON 字符串。
 * 按行解析：围栏代码块/表格/标题/分割线/引用/嵌入卡片/三种列表，其余普通行
 * 合并为段落（换行以 hardBreak 表示）；无法识别的行一律作为段落文本。
 */
export function markdownToJson(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const content = parseBlocks(lines, { i: 0 })
  return JSON.stringify({ type: 'doc', content })
}

/** 逐行解析块级结构；s.i 为游标（跨函数共享推进） */
function parseBlocks(lines: string[], s: { i: number }): PMNode[] {
  const out: PMNode[] = []
  let plain: string[] = [] // 连续普通行缓存（合并为一个段落）

  const flushPlain = () => {
    if (plain.length > 0) {
      out.push(makeParagraph(plain))
      plain = []
    }
  }

  while (s.i < lines.length) {
    const raw = lines[s.i]
    const line = raw.trim()

    if (line === '') {
      s.i++
      flushPlain()
      continue
    }

    // 围栏代码块
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      flushPlain()
      s.i++
      const code: string[] = []
      while (s.i < lines.length && !/^```\s*$/.test(lines[s.i].trim())) {
        code.push(lines[s.i])
        s.i++
      }
      s.i++ // 跳过收尾的 ```
      out.push({
        type: 'codeBlock',
        attrs: { language: fence[1].trim() },
        ...(code.length > 0 ? { content: [{ type: 'text', text: code.join('\n') }] } : {}),
      })
      continue
    }

    // 管道表格（连续以 | 开头的行）
    if (line.startsWith('|')) {
      flushPlain()
      out.push(parseTable(lines, s))
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushPlain()
      s.i++
      out.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      })
      continue
    }

    // 水平分割线
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushPlain()
      s.i++
      out.push({ type: 'horizontalRule' })
      continue
    }

    // 引用块 / 嵌入卡片（> [嵌入] 标题 (类型)）
    if (line.startsWith('>')) {
      flushPlain()
      const inner: string[] = []
      while (s.i < lines.length && lines[s.i].trim().startsWith('>')) {
        inner.push(lines[s.i].trim().replace(/^>\s?/, ''))
        s.i++
      }
      const single = inner.join('\n').trim()
      const embed = single.match(/^\[嵌入\]\s*(.*?)\s*(?:\(([^()]*)\))?$/)
      if (embed) {
        out.push({ type: 'embedCard', attrs: { title: embed[1], type: embed[2] ?? '' } })
      } else {
        const content = parseBlocks(inner, { i: 0 })
        out.push(content.length > 0 ? { type: 'blockquote', content } : { type: 'blockquote' })
      }
      continue
    }

    // 列表（无序 / 有序 / 任务）：收集连续列表行后建树
    if (matchListLine(raw) !== null) {
      flushPlain()
      const recs: ListRec[] = []
      while (s.i < lines.length) {
        const rec = matchListLine(lines[s.i])
        if (rec === null) break
        recs.push(rec)
        s.i++
      }
      out.push(...buildLists(recs, { v: 0 }, recs[0]?.level ?? 0))
      continue
    }

    // 普通文本行：缓存，连续行最终合并成一个段落
    plain.push(line)
    s.i++
  }
  flushPlain()
  return out
}

/** 识别一行列表语法；缩进按每 2 个空格一层换算 */
function matchListLine(raw: string): ListRec | null {
  const m = raw.match(/^[ \t]*/)
  const indent = (m?.[0] ?? '').replace(/\t/g, '  ').length
  const rest = raw.slice(m?.[0].length ?? 0)
  let m2 = rest.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
  if (m2) {
    return { level: Math.floor(indent / 2), kind: 'task', text: m2[2], checked: m2[1] !== ' ', order: 0 }
  }
  m2 = rest.match(/^[-*]\s+(.*)$/)
  if (m2) {
    return { level: Math.floor(indent / 2), kind: 'bullet', text: m2[1], checked: false, order: 0 }
  }
  m2 = rest.match(/^(\d+)(?:[.)])\s+(.*)$/)
  if (m2) {
    return { level: Math.floor(indent / 2), kind: 'ordered', text: m2[2], checked: false, order: Number(m2[1]) }
  }
  return null
}

/**
 * 按缩进层级把扁平列表记录建成嵌套列表节点：
 * 同层级连续同类型项归入一个 list，更深缩进递归挂到当前项的 content 里。
 */
function buildLists(recs: ListRec[], pos: { v: number }, level: number): PMNode[] {
  const out: PMNode[] = []
  while (pos.v < recs.length && recs[pos.v].level === level) {
    const kind = recs[pos.v].kind
    const start = recs[pos.v].order
    const items: PMNode[] = []
    while (pos.v < recs.length && recs[pos.v].level === level && recs[pos.v].kind === kind) {
      const rec = recs[pos.v++]
      const nested = buildLists(recs, pos, level + 1)
      const content: PMNode[] = [makeParagraph([rec.text]), ...nested]
      items.push(
        kind === 'task'
          ? { type: 'taskItem', attrs: { checked: rec.checked }, content }
          : { type: 'listItem', content },
      )
    }
    if (kind === 'ordered') out.push({ type: 'orderedList', attrs: { start }, content: items })
    else if (kind === 'task') out.push({ type: 'taskList', content: items })
    else out.push({ type: 'bulletList', content: items })
  }
  return out
}

/** 解析连续的管道表格行（含表头分隔行识别） */
function parseTable(lines: string[], s: { i: number }): PMNode {
  const rawRows: string[][] = []
  while (s.i < lines.length) {
    const line = lines[s.i].trim()
    if (!line.startsWith('|')) break
    s.i++
    // 按未转义的竖线切分单元格，再还原 \| 转义
    rawRows.push(
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, '|')),
    )
  }
  const isSep = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
  const hasHeader = rawRows.length >= 2 && isSep(rawRows[1])
  const rows: PMNode[] = rawRows
    .filter((_, idx) => !(hasHeader && idx === 1))
    .map((cells, idx) => ({
      type: 'tableRow',
      content: cells.map((c) => ({
        type: hasHeader && idx === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', ...(c === '' ? {} : { content: parseInline(c) }) }],
      })),
    }))
  return { type: 'table', content: rows }
}

/** 多行文本 → 段落（行间插入 hardBreak） */
function makeParagraph(textLines: string[]): PMNode {
  const content: PMNode[] = []
  textLines.forEach((l, i) => {
    if (i > 0) content.push({ type: 'hardBreak' })
    content.push(...parseInline(l))
  })
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

/** 行内解析：目前识别 ![](src) 内联图片，其余输出为纯文本节点 */
const IMAGE_RE = /!\[([^\]]*)\]\(([^()\s]+)\)/g

function parseInline(text: string): PMNode[] {
  const nodes: PMNode[] = []
  let last = 0
  for (const m of text.matchAll(IMAGE_RE)) {
    const start = m.index ?? 0
    if (start > last) nodes.push({ type: 'text', text: text.slice(last, start) })
    nodes.push({ type: 'image', attrs: { src: m[2], alt: m[1] } })
    last = start + m[0].length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

/* ==================== 控制台可跑示例（复制到浏览器控制台执行） ====================
 *
 * const { jsonToMarkdown, markdownToJson } = await import('/src/lib/markdown.ts')
 *
 * 示例 1：JSON → Markdown（标题 + 段落）
 *   jsonToMarkdown('{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"安装指南"}]},{"type":"paragraph","content":[{"type":"text","text":"先安装依赖"},{"type":"hardBreak"},{"type":"text","text":"再启动服务"}]}]}')
 *   // => '## 安装指南\n\n先安装依赖\n再启动服务'
 *
 * 示例 2：JSON → Markdown（任务列表 + 代码块 + 嵌入卡片）
 *   jsonToMarkdown('{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"已完成项"}]}]}]},{"type":"codeBlock","attrs":{"language":"ts"},"content":[{"type":"text","text":"const a = 1"}]},{"type":"embedCard","attrs":{"title":"季度报表","type":"excel"}}]}')
 *   // => '- [x] 已完成项\n\n```ts\nconst a = 1\n```\n\n> [嵌入] 季度报表 (excel)'
 *
 * 示例 3：Markdown → JSON（标题 / 无序列表 / 引用 / 表格）
 *   markdownToJson('# 标题\n\n- 要点一\n- 要点二\n\n> 引用一句名言\n\n| 列A | 列B |\n| --- | --- |\n| 1 | 2 |')
 *   // => '{"type":"doc","content":[heading, bulletList(2 项), blockquote, table(表头+1 行)]}'
 *
 * 示例 4：往返校验（Markdown → JSON → Markdown 保持一致）
 *   jsonToMarkdown(markdownToJson('1. 第一项\n2. 第二项\n\n---\n\n![图片](https://a.png)'))
 *   // => '1. 第一项\n2. 第二项\n\n---\n\n![](https://a.png)'
 */
