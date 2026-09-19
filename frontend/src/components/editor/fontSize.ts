/**
 * 行内文字大小：挂在 textStyle mark 上（与 Color 同一套），
 * 写入 span style="font-size: …"，持久化进 ProseMirror JSON。
 */
import '@tiptap/extension-text-style'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'

/** 正文默认字号（wiki-editor.css .ProseMirror font-size: 15px） */
export const DEFAULT_FONT_SIZE_PX = 15

/** 斜杠/加号插入表情：正文默认字号的 3 倍 */
export const EMOJI_FONT_SIZE = `${DEFAULT_FONT_SIZE_PX * 3}px`

/** 选区工具栏字号选项（空字符串 = 恢复默认） */
export const FONT_SIZE_OPTIONS: { label: string; value: string }[] = [
  { label: '字号', value: '' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '24', value: '24px' },
  { label: '36', value: '36px' },
  { label: '45', value: '45px' },
  { label: '48', value: '48px' },
]

/** 匹配 emoji（含变体选择符 / ZWJ 序列） */
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu

/**
 * 给尚未设置字号的 emoji 打上 3 倍正文默认字号。
 * 已有 fontSize 的文字（含用户手动改过的表情）不覆盖。
 */
export function markBareEmojis(state: EditorState, tr: Transaction): Transaction | null {
  const markType = state.schema.marks.textStyle
  if (!markType) return null
  let changed = false
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type === markType && m.attrs.fontSize)) return
    const text = node.text
    EMOJI_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EMOJI_RE.exec(text))) {
      tr.addMark(pos + m.index, pos + m.index + m[0].length, markType.create({ fontSize: EMOJI_FONT_SIZE }))
      changed = true
    }
  })
  return changed ? tr : null
}

export type FontSizeOptions = {
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

/**
 * 给 textStyle 增加 fontSize 属性，并提供 setFontSize / unsetFontSize。
 */
export const FontSize = Extension.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('emojiAutoSize'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null
          return markBareEmojis(newState, newState.tr)
        },
      }),
    ]
  },
})
