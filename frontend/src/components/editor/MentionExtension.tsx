/**
 * @提及（mention）扩展：基于 tiptap Mention + 自定义 suggestion 弹层。
 * - 候选人由外部 provider 提供（PageView 传空间成员检索，仅空间内成员可被 @）
 * - 弹层用原生 DOM 渲染（tailwind 样式），支持 ↑↓ 选择、Enter 确认、Esc 关闭
 * - mention 节点序列化为 {"type":"mention","attrs":{"id","label"}}，后端据此提取通知
 */
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'

export interface MentionOption {
  id: number
  label: string
}

export type MentionProvider = (query: string) => Promise<MentionOption[]>

interface PanelState {
  items: MentionOption[]
  command: (option: MentionOption) => void
  selectedIndex: number
}

const PANEL_CLASS =
  'wiki-mention-panel fixed z-[60] max-h-60 w-56 overflow-y-auto rounded-pop border border-line bg-surface p-1 shadow-3'

/** 渲染候选面板：原生 DOM + tailwind 样式 */
function createPanel() {
  const el = document.createElement('div')
  el.className = PANEL_CLASS
  const state: PanelState = { items: [], command: () => {}, selectedIndex: 0 }

  const render = () => {
    el.innerHTML = ''
    if (state.items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'px-2.5 py-2 text-meta text-ink-3'
      empty.textContent = '无匹配的空间成员'
      el.appendChild(empty)
      return
    }
    state.items.forEach((item, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = [
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        i === state.selectedIndex ? 'bg-sunken text-ink-1' : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
      ].join(' ')
      const avatar = document.createElement('span')
      avatar.className =
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white'
      avatar.textContent = (item.label || '?').slice(0, 1).toUpperCase()
      const name = document.createElement('span')
      name.className = 'min-w-0 flex-1 truncate'
      name.textContent = item.label
      btn.appendChild(avatar)
      btn.appendChild(name)
      // mousedown 触发，避免编辑器先失焦导致 suggestion 关闭
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        state.command(item)
      })
      el.appendChild(btn)
    })
  }

  return {
    el,
    set(props: SuggestionProps<MentionOption>) {
      state.command = (option) => props.command(option)
      state.items = props.items as MentionOption[]
      state.selectedIndex = Math.min(state.selectedIndex, Math.max(state.items.length - 1, 0))
      render()
      const rect = props.clientRect?.()
      if (rect) {
        el.style.left = `${rect.left}px`
        el.style.top = `${rect.bottom + 6}px`
      }
    },
    onKeyDown(props: SuggestionKeyDownProps): boolean {
      const count = Math.max(state.items.length, 1)
      if (props.event.key === 'ArrowDown') {
        state.selectedIndex = (state.selectedIndex + 1) % count
        render()
        return true
      }
      if (props.event.key === 'ArrowUp') {
        state.selectedIndex = (state.selectedIndex - 1 + count) % count
        render()
        return true
      }
      if (props.event.key === 'Enter') {
        const item = state.items[state.selectedIndex]
        if (item) state.command(item)
        return true
      }
      return false
    },
  }
}

export function buildMentionSuggestion(getProvider: () => MentionProvider | undefined) {
  let panel: ReturnType<typeof createPanel> | null = null

  return {
    char: '@',
    startOfLine: false,
    items: async ({ query }: { query: string }): Promise<MentionOption[]> => {
      const provider = getProvider()
      if (!provider) return []
      return provider(query)
    },
    render: () => {
      panel = createPanel()
      return {
        onStart: (props: SuggestionProps<MentionOption>) => {
          document.body.appendChild(panel!.el)
          panel!.set(props)
        },
        onUpdate: (props: SuggestionProps<MentionOption>) => {
          panel!.set(props)
        },
        onKeyDown: (props: SuggestionKeyDownProps) => panel!.onKeyDown(props),
        onExit: () => {
          panel!.el.remove()
          panel = null
        },
      }
    },
  }
}

/** 编辑器 mention 扩展（provider 经 getter 透传，避免闭包过期） */
export function createMentionExtension(getProvider: () => MentionProvider | undefined) {
  return Mention.configure({
    HTMLAttributes: { class: 'wiki-mention' },
    suggestion: buildMentionSuggestion(getProvider),
  })
}
