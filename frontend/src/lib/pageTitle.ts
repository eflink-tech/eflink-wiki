/** 页面标题提交规则：trim、拒绝空串、最长 256（与后端 node.title 一致） */

export const PAGE_TITLE_MAX = 256

export type TitleCommit =
  | { ok: false; reason: 'empty' }
  | { ok: true; title: string; changed: boolean }

export function preparePageTitle(raw: string, current: string): TitleCommit {
  const title = raw.trim().slice(0, PAGE_TITLE_MAX)
  if (!title) return { ok: false, reason: 'empty' }
  return { ok: true, title, changed: title !== current }
}
