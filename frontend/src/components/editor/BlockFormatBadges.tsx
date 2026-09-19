/**
 * 块级格式徽标（仅编辑态可见）：只为标题块在左侧外显示 H1~H5 标记，
 * 普通段落与列表/引用/代码块等不再显示徽标（避免噪音）。
 *
 * 实现：ProseMirror 插件 + 节点装饰（class wiki-has-badge + data-badge 属性），
 * 徽标本体由 CSS ::before 按块定位绘制。阅读态装饰虽在 DOM 中但不渲染（CSS 按容器类过滤）。
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** 插件 key（decorations 存取用） */
const badgeKey = new PluginKey<DecorationSet>('wikiBlockBadge')

/** 单个节点的徽标文案：仅 heading（H1~H5） */
function badgeFor(node: PMNode): string | null {
  if (node.type.name === 'heading') {
    const level = Number(node.attrs.level)
    return level >= 1 && level <= 5 ? `H${level}` : null
  }
  return null
}

/** 递归遍历文档，收集全部徽标装饰 */
function walk(node: PMNode, nodePos: number, out: Decoration[]): void {
  const badge = badgeFor(node)
  if (badge) {
    out.push(
      Decoration.node(nodePos, nodePos + node.nodeSize, {
        class: 'wiki-has-badge',
        'data-badge': badge,
      }),
    )
  }
  if (node.isLeaf) return
  // doc 节点内容起点即 nodePos，其余块节点内容起点为 nodePos + 1（跳过开 token）
  const contentStart = node.type.name === 'doc' ? nodePos : nodePos + 1
  node.forEach((child, offset) => {
    walk(child, contentStart + offset, out)
  })
}

/** 按当前文档构建装饰集合 */
function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  walk(doc, 0, decorations)
  return DecorationSet.create(doc, decorations)
}

/** 块级格式徽标扩展 */
export const BlockFormatBadges = Extension.create({
  name: 'blockFormatBadges',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: badgeKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => badgeKey.getState(state),
        },
      }),
    ]
  },
})
