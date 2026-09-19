/**
 * 代码块扩展：CodeBlockLowlight（lowlight 语法高亮）+ React NodeView。
 * - NodeView 左上角提供语言下拉（常用语言，选中即 setAttribute language 并重渲染高亮）；
 *   language 为 json 时额外提供「格式化」按钮（JSON.parse → stringify(,2) 写回，失败 toast）；
 * - 高亮本体仍由 CodeBlockLowlight 的内联装饰完成（NodeViewContent 承载代码文本）；
 * - CODE 徽标在此自绘（左侧外 -44px，仅编辑态显示，配合 wiki-editor--edit 容器类）。
 */
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Wand2 } from 'lucide-react'
import { createLowlight, common } from 'lowlight'
import { toast } from '../Toast'
// highlight.js 浅色主题（github）；代码块底色在 wiki-editor.css 中统一为浅色
import 'highlight.js/styles/github.css'

/** lowlight 实例：注册常用语言集（模块级单例，避免随编辑器重复构建） */
const lowlight = createLowlight(common)

/** 语言下拉选项（value 与 highlight.js 语言 id 一致） */
const LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext', label: '纯文本' },
  { value: 'json', label: 'JSON' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
]

/** 代码块 React NodeView */
function CodeBlockView({ node, editor, updateAttributes, getPos }: NodeViewProps) {
  const language = String(node.attrs.language ?? '') || 'plaintext'
  // 订阅 editable：阅读态语言退化为纯文本标签，且不显示格式化按钮
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  })
  const current = LANGUAGES.find((l) => l.value === language)

  /** JSON 格式化：解析失败 toast 提示；成功后整块文本替换为 2 空格缩进 */
  const formatJson = () => {
    const raw = node.textContent
    let formatted: string
    try {
      formatted = JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      toast.error('JSON 解析失败，请检查代码块内容')
      return
    }
    if (formatted === raw) {
      toast.info('已是标准格式，无需格式化')
      return
    }
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos !== 'number') return
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true
        // pos 为 codeBlock 节点起点，+1 进入内容；整段替换为格式化文本
        tr.replaceWith(pos + 1, pos + 1 + node.content.size, node.type.schema.text(formatted))
        return true
      })
      .run()
    toast.success('JSON 已格式化')
  }

  return (
    <NodeViewWrapper className="wiki-codeblock">
      {/* 编辑态块级格式徽标（与 heading/列表等徽标同款式） */}
      <span className="wiki-codeblock__badge">CODE</span>
      <div className="wiki-codeblock__bar" contentEditable={false}>
        {isEditable ? (
          <select
            className="wiki-codeblock__lang"
            title="代码语言"
            value={language}
            onChange={(e) => updateAttributes({ language: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="wiki-codeblock__lang-label">{current?.label ?? language}</span>
        )}
        {isEditable && language === 'json' && (
          <button
            type="button"
            className="wiki-codeblock__fmt"
            title="格式化 JSON"
            // 阻止按钮点击把编辑器选区吸走
            onMouseDown={(e) => e.preventDefault()}
            onClick={formatJson}
          >
            <Wand2 size={12} />
            格式化
          </button>
        )}
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}

/** 代码块节点：lowlight 高亮 + React NodeView */
export const WikiCodeBlock = CodeBlockLowlight.configure({
  lowlight,
  // 无语言标记时按纯文本渲染（避免触发 highlightAuto 的额外开销）
  defaultLanguage: 'plaintext',
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})
