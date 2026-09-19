/**
 * 知识库 Tiptap 富文本编辑器（阅读/编辑双态复用）。
 * 扩展：StarterKit + 表格系 + 任务列表 + 图片（上传）+ Placeholder + 嵌入块卡片
 * + 媒体系（附件/视频/音频/网页内嵌）+ 子页面引用 + 分栏。
 * 编辑态由 SlashMenu 提供 "/" 浮动插入菜单（分组扁平列表）。
 */
import Color from '@tiptap/extension-color'
import { FontSize, markBareEmojis } from './fontSize'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import { TableCellWithBackground, TableHeaderWithBackground } from './tableCellBackground'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Image from '@tiptap/extension-image'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useRef } from 'react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import { BlockFormatBadges } from './BlockFormatBadges'
import { EmbedCard } from './EmbedCardView'
import { SlashMenu } from './SlashMenu'
import { TrailingNode } from './TrailingNode'
import BlockHandle from './BlockHandle'
import TextAlign from '@tiptap/extension-text-align'
import { WikiCodeBlock } from './CodeBlockLowlightView'
import EditorBubbleMenu from './EditorBubbleMenu'
import TableInteractions from './TableInteractions'
import { Attachment, WikiAudio, WikiVideo, WebEmbed } from './MediaBlocks'
import { PageRef } from './PageRefBlock'
import { WikiColumn, WikiColumns } from './ColumnsExtension'
import { createMentionExtension } from './MentionExtension'
import './wiki-editor.css'

/** 编辑器 props */
export interface WikiEditorProps {
  /** 已发布/草稿的 ProseMirror JSON 字符串；null 渲染空文档 */
  initialContent: string | null
  /** 阅读态 false / 编辑态 true（切换不重建编辑器） */
  editable: boolean
  /** 内容变化回调（参数为序列化 JSON 字符串；防抖由调用方处理） */
  onUpdate?: (json: string) => void
  /** 空文档占位文案 */
  placeholder?: string
  /** 编辑器实例就绪回调（外部可借此调用 insertContent 等命令） */
  onReady?: (editor: Editor) => void
  /** @提及候选人检索（传了才启用 @；页面场景传空间成员检索） */
  mentionProvider?: (query: string) => Promise<{ id: number; label: string }[]>
  /** 实时协同（传入后启用 Yjs 多人同页编辑；与 initialContent 互斥，协同模式以 Y 文档为准） */
  collab?: CollabSession | null
}

/** 协同会话对象：PageView 进入编辑态时创建，离开时销毁 */
export interface CollabSession {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  user: { name: string; color: string }
}

/** 安全解析 JSON 字符串为文档对象；失败时降级为单段纯文本 */
function parseContent(json: string | null): Record<string, unknown> {
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed
    } catch {
      // 非 JSON：按纯文本降级
    }
  }
  if (json) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: json }] }],
    }
  }
  return { type: 'doc', content: [] }
}

export default function WikiEditor({
  initialContent,
  editable,
  onUpdate,
  placeholder,
  onReady,
  mentionProvider,
  collab,
}: WikiEditorProps) {
  // provider 经 ref 透传：扩展只创建一次，避免闭包里捕获过期回调
  const mentionProviderRef = useRef(mentionProvider)
  mentionProviderRef.current = mentionProvider
  const mentionExtension = useMemo(
    () => createMentionExtension(() => mentionProviderRef.current),
    [],
  )
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
        // 代码块换用 lowlight 版（语法高亮 + 语言选择 NodeView）
        codeBlock: false,
        // 协同模式下撤销/重做由 Yjs UndoManager 接管，必须关掉本地 history
        ...(collab ? { history: false } : {}),
      }),
      WikiCodeBlock,
      BlockFormatBadges,
      TrailingNode,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeaderWithBackground,
      TableCellWithBackground,
      TaskList,
      TaskItem.configure({ nested: true }),
      Attachment,
      WikiVideo,
      WikiAudio,
      WebEmbed,
      PageRef,
      WikiColumns,
      WikiColumn,
      mentionExtension,
      // 实时协同：多端同页编辑 + 在线成员光标（传入 collab 会话才启用）
      ...(collab
        ? [
            Collaboration.configure({ document: collab.ydoc }),
            CollaborationCursor.configure({
              provider: collab.provider,
              user: collab.user,
            }),
          ]
        : []),
      Placeholder.configure({
        placeholder: ({ editor: ed, node, pos }) => {
          // 分栏内的空段落用不同提示（对齐语雀）
          if (node.type.name === 'paragraph') {
            try {
              const $pos = ed.state.doc.resolve(pos)
              for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'column') return '点击 +，或输入 / 快捷插入组件'
              }
            } catch {
              // 位置解析失败按默认文案
            }
          }
          return placeholder ?? '输入 “/” 唤出插入菜单，或直接开始书写…'
        },
      }),
      EmbedCard,
    ],
    // 协同模式：正文以 Y 文档为唯一事实源（空房间由服务端同步后按需播种），本地初始内容必须为空
    content: collab ? { type: 'doc', content: [] } : parseContent(initialContent),
    editable,
    onCreate: ({ editor: current }) => {
      const next = markBareEmojis(current.state, current.state.tr)
      if (next) current.view.dispatch(next)
    },
    onUpdate: ({ editor: current }) => {
      onUpdate?.(JSON.stringify(current.getJSON()))
    },
  })

  // 阅读/编辑切换：同步 editable，不重建编辑器（保留光标与撤销栈）
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // 阅读态：父组件后续写入的已发布正文必须同步进编辑器。
  // useEditor 只在挂载时吃 initialContent；发布后同实例不重建时否则会一直显示旧内容。
  const lastAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!editor || editor.isDestroyed || editable) return
    const incoming = initialContent ?? ''
    if (lastAppliedRef.current === null) {
      lastAppliedRef.current = incoming
      return
    }
    if (lastAppliedRef.current === incoming) return
    lastAppliedRef.current = incoming
    editor.commands.setContent(parseContent(initialContent), false)
    const next = markBareEmojis(editor.state, editor.state.tr)
    if (next) editor.view.dispatch(next)
  }, [editor, editable, initialContent])

  // 就绪回调：通过 ref 转发，父组件内联回调变化不会重复触发
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    if (editor) {
      onReadyRef.current?.(editor)
      // 调试/E2E 钩子：暴露编辑器实例供自动化测试驱动选区与命令
      ;(window as unknown as { __wikiEditor?: Editor }).__wikiEditor = editor
    }
  }, [editor])

  return (
    <div className={editable ? 'wiki-editor wiki-editor--edit' : 'wiki-editor'}>
      {editable && editor && <SlashMenu editor={editor} />}
      {editable && editor && <EditorBubbleMenu editor={editor} />}
      {editable && editor && <TableInteractions editor={editor} />}
      {editable && editor && <BlockHandle editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
