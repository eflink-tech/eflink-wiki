/** 发布成功后，把当前编辑正文立刻写进阅读态快照，避免仍展示旧版本。 */

export interface PublishedSnapshot {
  title: string
  content: string
  versionNo: number
}

export function applyPublishedSnapshot<
  T extends { title: string; content: string | null; versionNo: number | null },
>(page: T, published: PublishedSnapshot): T {
  return {
    ...page,
    title: published.title,
    content: published.content,
    versionNo: published.versionNo,
  }
}
