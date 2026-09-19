/**
 * 版本对比：两个 ProseMirror JSON 字符串 → 行级 diff 结果。
 * 提取纯文本（递归取 text 节点、按块拼接），再用 diff-match-patch 按行对比。
 */
import { DIFF_DELETE, DIFF_INSERT, diff_match_patch } from 'diff-match-patch'

/** 单行对比结果：same 保留 / add 新增 / del 删除 */
export type DiffRowType = 'same' | 'add' | 'del'

export interface DiffRow {
  type: DiffRowType
  text: string
}

/** 最小 ProseMirror 节点形状（只用于遍历，避免依赖 core 类型） */
interface PMNodeLike {
  type?: string
  text?: string
  content?: PMNodeLike[]
}

/** 行内节点集合：出现时追加到当前行，不产生块边界 */
const INLINE_TYPES = new Set(['text', 'image', 'embedCard'])

function parseDoc(json: string | null): PMNodeLike | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as PMNodeLike
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 当前缓冲冲刷为一行 */
function flushLine(lines: string[], buffer: string[]): void {
  const text = buffer.join('').replace(/\u00a0/g, ' ').trimEnd()
  lines.push(text)
  buffer.length = 0
}

/** 递归遍历：text 节点累积到当前行，块级节点结束时换行 */
function walkNode(node: PMNodeLike, lines: string[], buffer: string[]): void {
  if (node.type === 'text') {
    buffer.push(node.text ?? '')
    return
  }
  for (const child of node.content ?? []) {
    walkNode(child, lines, buffer)
  }
  // 非 text 且非行内（hardBreak 等）的节点视为块级：结束当前行
  const type = node.type ?? ''
  if (type !== 'hardBreak' && !INLINE_TYPES.has(type)) {
    flushLine(lines, buffer)
  }
}

/** ProseMirror JSON 字符串 → 纯文本行数组 */
export function extractTextLines(json: string | null): string[] {
  const doc = parseDoc(json)
  if (!doc) return []
  const lines: string[] = []
  const buffer: string[] = []
  walkNode(doc, lines, buffer)
  if (buffer.length > 0) flushLine(lines, buffer)
  return lines
}

/**
 * 行级对比：oldContent / newContent 均为 ProseMirror JSON 字符串（可为 null）。
 * 返回按序的行结果列表，供版本抽屉渲染（红删绿增）。
 */
export function diffContents(oldContent: string | null, newContent: string | null): DiffRow[] {
  const oldText = extractTextLines(oldContent).join('\n')
  const newText = extractTextLines(newContent).join('\n')
  if (!oldText && !newText) return []

  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(oldText, newText)
  dmp.diff_cleanupSemantic(diffs)

  // 将带换行的 diff 片段展开为行级结果：
  // 每遇到一个换行就结束当前行；同一段落内类型切换时也分行（行级粒度的近似）
  const rows: DiffRow[] = []
  let current: DiffRow | null = null

  const pushCurrent = () => {
    if (current) rows.push(current)
    current = null
  }

  for (const [op, text] of diffs) {
    const type: DiffRowType = op === DIFF_INSERT ? 'add' : op === DIFF_DELETE ? 'del' : 'same'
    const segments = text.split('\n')
    segments.forEach((segment, index) => {
      // index > 0 表示跨过一个换行：先结束上一行
      if (index > 0) pushCurrent()
      if (segment === '') return
      if (current && current.type === type) {
        current.text += segment
      } else {
        pushCurrent()
        current = { type, text: segment }
      }
    })
  }
  pushCurrent()

  return rows
}
