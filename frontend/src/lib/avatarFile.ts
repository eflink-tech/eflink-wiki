/** 头像上传校验：限制图片类型与大小，供个人信息弹窗使用 */

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

const AVATAR_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function validateAvatarFile(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return '文件为空'
  if (file.size > AVATAR_MAX_BYTES) return '头像不能超过 5MB'
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  const mimeOk = !file.type || AVATAR_MIMES.has(file.type)
  if (!AVATAR_EXTS.has(ext) || !mimeOk) return '请选择图片文件（PNG / JPG / GIF / WebP）'
  return null
}
