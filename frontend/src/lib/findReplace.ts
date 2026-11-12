/**
 * 编辑器内查找替换（ProseMirror 插件）。
 *
 * 匹配在每个文本块内部进行：普通文本、标题、表格单元格、代码块都覆盖；
 * 遇到换行/图片等行内节点会切断匹配，避免跨块误命中。
 * 全部命中用装饰高亮，当前命中额外标记并滚动到可视区。
 */
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface FindMatch {
  from: number
  to: number
}

export interface FindReplaceState {
  query: string
  caseSensitive: boolean
  matches: FindMatch[]
  current: number
  decorations: DecorationSet
}

export const findReplaceKey = new PluginKey<FindReplaceState>('wikiFindReplace')

/** 一段连续文本（同一文本块内、不含换行/图片） */
interface TextRun {
  segs: { docFrom: number; textStart: number; length: number }[]
  text: string
}

function pushMatch(run: TextRun, start: number, end: number, out: FindMatch[]): void {
  const mapStart = (offset: number, isEnd: boolean): number | null => {
    for (let i = 0; i < run.segs.length; i++) {
      const seg = run.segs[i]
      const segEnd = seg.textStart + seg.length
      if (offset < segEnd || (isEnd && offset === segEnd)) {
        return seg.docFrom + (offset - seg.textStart)
      }
    }
    return null
  }
  const from = mapStart(start, false)
  const to = mapStart(end, true)
  if (from != null && to != null && to > from) out.push({ from, to })
}

function collectMatches(doc: PMNode, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: FindMatch[] = []

  doc.descendants((node, blockPos) => {
    if (!node.isTextblock) return true

    let run: TextRun = { segs: [], text: '' }
    const flush = () => {
      if (!run.text) return
      const hay = caseSensitive ? run.text : run.text.toLowerCase()
      let idx = hay.indexOf(needle)
      while (idx >= 0) {
        pushMatch(run, idx, idx + needle.length, out)
        idx = hay.indexOf(needle, idx + Math.max(1, needle.length))
      }
      run = { segs: [], text: '' }
    }

    node.descendants((child, childPos) => {
      if (child.isText) {
        const text = child.text ?? ''
        if (!text) return true
        // 内层 childPos 是相对文本块内容的 0 基偏移，文档坐标需再加文本块起始 token（+1）
        run.segs.push({ docFrom: blockPos + 1 + childPos, textStart: run.text.length, length: text.length })
        run.text += text
      } else if (child.isInline) {
        // 换行/图片/嵌入等行内节点：切断匹配，避免跨节点误报
        flush()
      }
      return true
    })
    flush()
    return false
  })
  return out
}

function buildState(
  state: EditorState,
  query: string,
  caseSensitive: boolean,
  current: number,
): FindReplaceState {
  const matches = collectMatches(state.doc, query, caseSensitive)
  const safeCurrent = matches.length === 0 ? 0 : Math.min(Math.max(current, 0), matches.length - 1)
  const decorations = DecorationSet.create(
    state.doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === safeCurrent ? 'wiki-find-match wiki-find-current' : 'wiki-find-match',
      }),
    ),
  )
  return { query, caseSensitive, matches, current: safeCurrent, decorations }
}

type FindMeta =
  | { type: 'set'; query: string; caseSensitive: boolean }
  | { type: 'current'; index: number }
  | { type: 'clear' }

export function findReplacePlugin(): Plugin<FindReplaceState> {
  return new Plugin<FindReplaceState>({
    key: findReplaceKey,
    state: {
      init: (_, state) => buildState(state, '', false, 0),
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(findReplaceKey) as FindMeta | undefined
        if (meta?.type === 'clear') return buildState(newState, '', false, 0)
        if (meta?.type === 'set') return buildState(newState, meta.query, meta.caseSensitive, 0)
        if (meta?.type === 'current') {
          return { ...prev, current: prev.matches.length ? Math.min(meta.index, prev.matches.length - 1) : 0,
            decorations: DecorationSet.create(
              newState.doc,
              prev.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === Math.min(meta.index, prev.matches.length - 1) ? 'wiki-find-match wiki-find-current' : 'wiki-find-match',
                }),
              ),
            ) }
        }
        if (tr.docChanged && prev.query) {
          return buildState(newState, prev.query, prev.caseSensitive, prev.current)
        }
        return prev
      },
    },
    props: {
      decorations(state) {
        return findReplaceKey.getState(state)?.decorations ?? null
      },
    },
  })
}

/** Tiptap 扩展：注册查找替换插件（阅读态也存在，但不会产生装饰） */
export const FindReplace = Extension.create({
  name: 'wikiFindReplace',
  addProseMirrorPlugins() {
    return [findReplacePlugin()]
  },
})

export function getFindState(editor: { state: EditorState }): FindReplaceState | undefined {
  return findReplaceKey.getState(editor.state)
}

/** 设置关键词（每次输入都重置到第一个命中） */
export function setFindQuery(
  editor: { view: { dispatch: (tr: Transaction) => void }; state: EditorState },
  query: string,
  caseSensitive: boolean,
): void {
  const tr = editor.state.tr.setMeta(findReplaceKey, { type: 'set', query, caseSensitive } satisfies FindMeta)
  editor.view.dispatch(tr)
}

/** 跳转到第 index 个命中并选中 */
export function goToMatch(
  editor: { view: { dispatch: (tr: Transaction) => void; focus: () => void }; state: EditorState },
  index: number,
): void {
  const st = getFindState(editor)
  if (!st || st.matches.length === 0) return
  const safe = ((index % st.matches.length) + st.matches.length) % st.matches.length
  const m = st.matches[safe]
  const tr = editor.state.tr
    .setSelection(TextSelection.create(editor.state.doc, m.from, m.to))
    .setMeta(findReplaceKey, { type: 'current', index: safe } satisfies FindMeta)
    .scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
}

/** 替换当前命中；返回是否发生替换 */
export function replaceCurrent(editor: { view: { dispatch: (tr: Transaction) => void }; state: EditorState }, replacement: string): boolean {
  const st = getFindState(editor)
  if (!st || st.matches.length === 0) return false
  const m = st.matches[st.current]
  if (!m) return false
  editor.view.dispatch(editor.state.tr.insertText(replacement, m.from, m.to))
  return true
}

/** 全部替换；返回替换次数 */
export function replaceAll(
  editor: { view: { dispatch: (tr: Transaction) => void }; state: EditorState },
  replacement: string,
): number {
  const st = getFindState(editor)
  if (!st || st.matches.length === 0) return 0
  const tr = editor.state.tr
  // 从后往前替换，避免位置偏移
  for (let i = st.matches.length - 1; i >= 0; i--) {
    const m = st.matches[i]
    tr.insertText(replacement, m.from, m.to)
  }
  editor.view.dispatch(tr)
  return st.matches.length
}

/** 清空搜索状态与装饰 */
export function clearFind(editor: { view: { dispatch: (tr: Transaction) => void }; state: EditorState }): void {
  editor.view.dispatch(editor.state.tr.setMeta(findReplaceKey, { type: 'clear' } satisfies FindMeta))
}
