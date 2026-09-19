/**
 * 轻量跨组件事件总线（基于 window CustomEvent）。
 * 用于深层页面（如欢迎页、空间页）请求 AppLayout 打开某个弹窗，
 * 避免 props 层层透传。
 */

/** 请求打开"新建空间"弹窗 */
export function emitOpenSpaceForm(): void {
  window.dispatchEvent(new CustomEvent('wiki:open-space-form'))
}

export function onOpenSpaceForm(handler: () => void): () => void {
  const fn = () => handler()
  window.addEventListener('wiki:open-space-form', fn)
  return () => window.removeEventListener('wiki:open-space-form', fn)
}

/** 请求打开"新建页面"弹窗；parentId 为 null 表示根页面 */
export function emitOpenNodeCreate(parentId: number | null): void {
  window.dispatchEvent(
    new CustomEvent('wiki:open-node-create', { detail: { parentId } }),
  )
}

export function onOpenNodeCreate(
  handler: (parentId: number | null) => void,
): () => void {
  const fn = (e: Event) =>
    handler(
      (e as CustomEvent<{ parentId: number | null }>).detail?.parentId ?? null,
    )
  window.addEventListener('wiki:open-node-create', fn)
  return () => window.removeEventListener('wiki:open-node-create', fn)
}

/** 页面树已变更（如编辑页内改标题），通知布局刷新侧栏与面包屑 */
export function emitTreeChanged(): void {
  window.dispatchEvent(new CustomEvent('wiki:tree-changed'))
}

export function onTreeChanged(handler: () => void): () => void {
  const fn = () => handler()
  window.addEventListener('wiki:tree-changed', fn)
  return () => window.removeEventListener('wiki:tree-changed', fn)
}
