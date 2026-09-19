/** diff-match-patch 无自带类型，这里声明项目用到的最小面 */
declare module 'diff-match-patch' {
  /** 单个对比片段：[操作类型, 文本]，操作类型取 DIFF_DELETE / DIFF_EQUAL / DIFF_INSERT */
  export type DiffPart = [number, string]

  export const DIFF_DELETE: number
  export const DIFF_EQUAL: number
  export const DIFF_INSERT: number

  export class diff_match_patch {
    /** 主对比入口：返回按序的片段数组 */
    diff_main(text1: string, text2: string, opt_checklines?: boolean): DiffPart[]
    /** 语义化整理片段（合并碎片，让结果更适合人读） */
    diff_cleanupSemantic(diffs: DiffPart[]): void
  }
}
