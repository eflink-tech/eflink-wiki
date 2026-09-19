/** 斜杠/加号插入菜单定位（视口坐标，position:fixed） */

export const SLASH_MENU_WIDTH = 288
export const SLASH_MENU_FULL_H = 470
export const EMOJI_PANEL_W = 320
export const EMOJI_PANEL_H = 280

export interface SlashMenuAnchor {
  left: number
  top: number
  bottom: number
  right?: number
}

/** 按锚点把菜单放到视口内：优先锚点下方，底部不够则翻到上方，水平贴锚点 left */
export function placeSlashMenu(
  anchor: SlashMenuAnchor,
  viewport: { width: number; height: number },
  menuH = SLASH_MENU_FULL_H,
  menuW = SLASH_MENU_WIDTH,
): { top: number; left: number; cursorTop: number; cursorBottom: number } {
  const maxLeft = Math.max(12, viewport.width - menuW - 12)
  const left = Math.min(Math.max(anchor.left, 12), maxLeft)
  const below = anchor.bottom + 8
  const spaceBelow = viewport.height - below - 8
  const spaceAbove = anchor.top - 16
  const top =
    spaceBelow >= Math.min(menuH, 240) || spaceBelow >= spaceAbove
      ? below
      : Math.max(8, anchor.top - menuH - 8)
  return { top, left, cursorTop: anchor.top, cursorBottom: anchor.bottom }
}

type CaretBox = { left: number; top: number; bottom: number }

/**
 * coordsAtPos 在块边界会给出两侧光标。取更靠左的完整矩形，
 * 避免菜单钉在宽表格/分栏右缘。仅当光标贴在块右缘时才回落到块左边（空行全宽 caret）。
 */
export function pickCaretAnchor(
  a: CaretBox,
  b: CaretBox,
  clip?: { left: number; right: number },
): SlashMenuAnchor {
  const chosen = a.left <= b.left ? a : b
  if (clip && chosen.left > clip.left + 80 && chosen.left > clip.right - 48) {
    return { left: clip.left, top: chosen.top, bottom: chosen.bottom }
  }
  return { left: chosen.left, top: chosen.top, bottom: chosen.bottom }
}
