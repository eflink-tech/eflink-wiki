import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_BYTES, validateAvatarFile } from './avatarFile'

function file(partial: { name: string; type?: string; size?: number }) {
  return { name: partial.name, type: partial.type ?? '', size: partial.size ?? 1024 }
}

describe('validateAvatarFile', () => {
  it('接受常见图片扩展名', () => {
    expect(validateAvatarFile(file({ name: 'a.png', type: 'image/png' }))).toBeNull()
    expect(validateAvatarFile(file({ name: 'a.JPG', type: 'image/jpeg' }))).toBeNull()
    expect(validateAvatarFile(file({ name: 'a.webp' }))).toBeNull()
  })

  it('拒绝非图片', () => {
    expect(validateAvatarFile(file({ name: 'a.pdf', type: 'application/pdf' }))).toBe(
      '请选择图片文件（PNG / JPG / GIF / WebP）',
    )
    expect(validateAvatarFile(file({ name: 'a.svg', type: 'image/svg+xml' }))).toBe(
      '请选择图片文件（PNG / JPG / GIF / WebP）',
    )
    expect(validateAvatarFile(file({ name: 'evil.png', type: 'text/html' }))).toBe(
      '请选择图片文件（PNG / JPG / GIF / WebP）',
    )
  })

  it('拒绝空文件与超大文件', () => {
    expect(validateAvatarFile(file({ name: 'a.png', type: 'image/png', size: 0 }))).toBe('文件为空')
    expect(
      validateAvatarFile(file({ name: 'a.png', type: 'image/png', size: AVATAR_MAX_BYTES + 1 })),
    ).toBe('头像不能超过 5MB')
  })
})
