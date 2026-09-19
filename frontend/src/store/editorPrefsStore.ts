/**
 * 编辑器偏好（zustand persist）：
 * - wide：内容列宽偏好，false=窄屏（阅读栏 768px，默认）/ true=宽屏（100%）
 * - 仅作用于 PageView 的阅读态与编辑态内容容器；演示模式（960px 大屏）不受影响
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EditorPrefsState {
  /** 是否宽屏内容列 */
  wide: boolean
  /** 宽窄切换 */
  toggle: () => void
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      wide: false,
      toggle: () => set((s) => ({ wide: !s.wide })),
    }),
    // 持久化键名：本地记忆宽窄偏好，刷新后保持
    { name: 'wiki-editor-prefs' },
  ),
)
