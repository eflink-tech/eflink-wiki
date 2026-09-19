/**
 * eflink-wiki 实时协同服务（Hocuspocus + Yjs）
 *
 * 职责（刻意保持瘦）：
 * - 鉴权：onAuthenticate 把客户端带来的 JWT 转发给 wiki 后端 /api/internal/collab/auth
 *   （内部共享密钥保护），由后端统一做 token 校验与空间角色解析，返回读写权限
 * - 持久化：onLoadDocument 拉取该页面的 Yjs 二进制快照；onStoreDocument（防抖 + 最后一人离开）
 *   回写快照。页面正文的草稿 JSON 仍由前端既有自动保存/发布链路写 wiki_draft，双保险
 * - 房间命名：wiki-node-<nodeId>；awareness（在线成员/光标）由客户端 provider 自行维护
 *
 * 配置全部走环境变量：
 *   COLLAB_PORT          监听端口（默认 18080）
 *   WIKI_BACKEND         wiki 后端地址（默认 http://127.0.0.1:18090）
 *   WIKI_INTERNAL_KEY    与后端约定的内部共享密钥（必填）
 */
import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'

const PORT = Number(process.env.COLLAB_PORT ?? 18080)
const WIKI_BACKEND = (process.env.WIKI_BACKEND ?? 'http://127.0.0.1:18090').replace(/\/$/, '')
const INTERNAL_KEY = process.env.WIKI_INTERNAL_KEY ?? ''

interface AuthInfo {
  userId: number
  username: string
  displayName: string
  readOnly: boolean
}

/** 解析房间名 → nodeId */
function nodeIdOf(documentName: string): number {
  const m = documentName.match(/^wiki-node-(\d+)$/)
  if (!m) throw new Error('invalid room')
  return Number(m[1])
}

/** 调 wiki 后端内部接口（共享密钥），非 200 抛错 */
async function callInternal<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WIKI_BACKEND}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': INTERNAL_KEY,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`wiki backend ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return (await res.json()) as T
}

const server = new Hocuspocus({
  port: PORT,
  async onAuthenticate(data) {
    if (!INTERNAL_KEY) throw new Error('collab server missing WIKI_INTERNAL_KEY')
    const nodeId = nodeIdOf(data.documentName)
    const token = String(data.token ?? '')
    if (!token) throw new Error('missing token')
    try {
      const info = await callInternal<AuthInfo>('/api/internal/collab/auth', {
        method: 'POST',
        body: JSON.stringify({ token, nodeId }),
      })
      // 查看者只读连接：能进页面看光标，但编辑不落库
      data.connection.readOnly = info.readOnly === true
      data.context.user = {
        id: info.userId,
        name: info.displayName || info.username,
        color: colorFor(info.userId),
      }
    } catch (e) {
      throw new Error('unauthorized')
    }
  },

  async onLoadDocument(data) {
    const nodeId = nodeIdOf(data.documentName)
    try {
      const res = await callInternal<{ state: string | null }>(
        `/api/internal/collab/doc?nodeId=${nodeId}`,
      )
      if (res.state) {
        const update = Buffer.from(res.state, 'base64')
        if (update.length > 0) {
          Y.applyUpdate(data.document, update)
        }
      }
    } catch (e) {
      // 拉取快照失败不阻塞房间创建（从空文档开始，前端会用草稿 JSON 播种）
      console.error(`[collab] load doc ${nodeId} failed:`, e)
    }
  },

  async onStoreDocument(data) {
    const nodeId = nodeIdOf(data.documentName)
    try {
      const state = Buffer.from(Y.encodeStateAsUpdate(data.document)).toString('base64')
      await callInternal('/api/internal/collab/doc', {
        method: 'POST',
        body: JSON.stringify({ nodeId, state }),
      })
    } catch (e) {
      console.error(`[collab] store doc ${nodeId} failed:`, e)
    }
  },

  /** 防抖落库间隔（毫秒）：协同编辑时高频变更被合并 */
  debounce: 3000,
  /** 最大防抖等待：即使一直有人编辑也强制落库 */
  maxDebounce: 15000,
})

/** 用户 → 光标颜色（按 id 稳定取色） */
function colorFor(userId: number): string {
  const palette = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1']
  return palette[userId % palette.length]
}

server.listen().then(() => {
  console.log(`[collab] listening on :${PORT}, backend=${WIKI_BACKEND}`)
})
