/** 文件上传：POST /api/upload（multipart 字段 file），返回可直接访问的相对 URL */
import { request } from '../../api/client'

/** 通用文件上传（图片/视频/音频/附件共用），返回可直接访问的相对 URL */
export async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  // axios 对 FormData 会自动带 multipart 边界，不要手动覆盖 Content-Type
  const res = await request<{ url: string }>({ url: '/upload', method: 'POST', data: form })
  return res.url
}

/** 图片上传（uploadFile 别名，历史调用点语义化） */
export function uploadImage(file: File): Promise<string> {
  return uploadFile(file)
}
