import { FileText, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as wikiApi from '../../api/wiki'
import type { Space } from '../../api/types'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../../components/Button'
import MemberManageDialog from '../../components/wiki/MemberManageDialog'
import { emitOpenNodeCreate } from '../../lib/events'

/** 我在空间内的角色名称 */
const SPACE_ROLE_NAMES: Record<number, string> = {
  1: '管理员',
  2: '编辑者',
  3: '查看者',
}

/** 空间页：选中空间但未选中页面时的概览与空态引导 */
export default function SpacePage() {
  const { spaceId: sid } = useParams()
  const spaceId = Number(sid)
  const me = useAuthStore((s) => s.user)
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [memberOpen, setMemberOpen] = useState(false)

  useEffect(() => {
    let alive = true
    wikiApi
      .listSpaces()
      .then((list) => {
        if (alive) setSpaces(list)
      })
      .catch(() => {
        if (alive) setSpaces([])
      })
    return () => {
      alive = false
    }
  }, [memberOpen])

  const space = spaces?.find((s) => s.id === spaceId) ?? null
  // 空间管理员或系统管理员可打开成员管理
  const canManageMember = space !== null && (space.role === 1 || me?.role === 1)

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ctrl bg-brand text-xl font-semibold text-white">
          {space ? space.icon || space.name.slice(0, 1) : '…'}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink-1">
            {space ? space.name : '加载中…'}
          </h1>
          {space && (
            <p className="mt-0.5 text-meta text-ink-3">
              创建者：{space.ownerName ?? '-'} ·{' '}
              {canManageMember ? (
                <button
                  type="button"
                  className="transition-colors hover:text-brand"
                  onClick={() => setMemberOpen(true)}
                  title="成员管理"
                >
                  {space.memberCount} 名成员
                </button>
              ) : (
                <span>{space.memberCount} 名成员</span>
              )}{' '}
              · {space.visibility === 0 ? '私有' : '登录可读'} · 我的角色：
              {SPACE_ROLE_NAMES[space.role]}
            </p>
          )}
        </div>
        {canManageMember && space && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setMemberOpen(true)}>
            <Users size={14} /> 成员管理
          </Button>
        )}
      </div>
      {space?.description && (
        <p className="mt-3 text-sm text-ink-2">{space.description}</p>
      )}

      <div className="mt-8 flex flex-col items-center rounded-card bg-sunken py-16">
        <FileText size={36} className="text-ink-3" />
        <p className="mt-3 text-sm text-ink-3">
          从左侧页面树选择一个页面，或创建第一个页面
        </p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => emitOpenNodeCreate(null)}
        >
          <Plus size={15} /> 新建页面
        </Button>
      </div>

      {memberOpen && space && (
        <MemberManageDialog
          spaceId={space.id}
          open
          onClose={() => setMemberOpen(false)}
        />
      )}
    </div>
  )
}
