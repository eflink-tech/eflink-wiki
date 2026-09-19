/**
 * 页面模板页（路由 /app/templates）：
 * 模板卡片列表（名称/描述/创建人/时间/删除）+ 「从模板新建页面」流程
 * （选空间 → 输入页面标题 → createNode 携带 templateId → 跳转新页面）。
 */
import { LayoutTemplate, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Space } from '../../api/types'
import type { TemplateItem } from '../../api/wiki'
import * as wikiApi from '../../api/wiki'
import { Button } from '../../components/Button'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { Spinner } from '../../components/Loading'
import { Input } from '../../components/Input'
import { toast } from '../../components/Toast'

/** 时间戳 → 'YYYY-MM-DD HH:mm'（兼容秒级时间戳；空值显示 '-'） */
function fmtTs(ts: number | null): string {
  if (!ts) return '-'
  const ms = ts < 1e12 ? ts * 1000 : ts
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 「从模板新建页面」弹窗 */
function CreateFromTemplateDialog({
  template,
  onClose,
}: {
  template: TemplateItem
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  // 可编辑角色（1 管理员 / 2 编辑者）的空间才允许从模板建页
  useEffect(() => {
    let alive = true
    wikiApi
      .listSpaces()
      .then((list) => {
        if (!alive) return
        const writable = list.filter((s) => s.role <= 2)
        setSpaces(writable)
        setSpaceId(writable.length > 0 ? writable[0].id : null)
      })
      .catch(() => {
        if (alive) setSpaces([])
      })
    return () => {
      alive = false
    }
  }, [])

  const submit = async () => {
    if (spaceId == null) {
      toast.error('请选择目标空间')
      return
    }
    const v = title.trim()
    if (!v) {
      toast.error('请输入页面标题')
      return
    }
    setCreating(true)
    try {
      // createNode 现有签名未声明 templateId；为不改 api 层，
      // 用宽类型变量传入（运行时会随请求体发送，后端据此填充模板内容）。
      const payload: {
        spaceId: number
        parentId: number | null
        title: string
        templateId?: number
      } = { spaceId, parentId: 0, title: v, templateId: template.id }
      const node = await wikiApi.createNode(payload)
      toast.success('页面已创建')
      onClose()
      navigate(`/app/space/${spaceId}/page/${node.id}`)
    } catch {
      // 拦截器已提示
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open
      title={`从模板新建页面：${template.title}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={creating}
            disabled={spaces !== null && spaces.length === 0}
            onClick={() => void submit()}
          >
            创建页面
          </Button>
        </>
      }
    >
      {spaces === null && (
        <div className="flex justify-center py-4">
          <Spinner size={18} />
        </div>
      )}
      {spaces !== null && spaces.length === 0 && (
        <p className="rounded-ctrl bg-warning-light px-3 py-2 text-meta text-warning-ink">
          你没有可编辑的空间（需要空间管理员或编辑者角色），无法从模板创建页面
        </p>
      )}
      {spaces !== null && spaces.length > 0 && (
        <>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-meta font-medium text-ink-2">
              目标空间（仅列出你可编辑的空间）
            </span>
            <select
              className="h-9 w-full rounded-ctrl border border-line bg-surface px-2 text-sm text-ink-1 outline-none transition-colors focus:border-brand"
              value={spaceId ?? ''}
              onChange={(e) => setSpaceId(Number(e.target.value))}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon ? `${s.icon} ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="页面标题"
            placeholder="新页面的标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          <p className="text-meta text-ink-3">
            将以模板「{template.title}」的内容创建新页面，创建后跳转到该页面。
          </p>
        </>
      )}
    </Dialog>
  )
}

/** 页面模板页（默认导出） */
export default function TemplatesPage() {
  const [items, setItems] = useState<TemplateItem[] | null>(null)
  /** 从模板新建页面的目标模板 */
  const [useTemplate, setUseTemplate] = useState<TemplateItem | null>(null)
  /** 待删除的模板 */
  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await wikiApi.listTemplates()
      setItems(res.list)
    } catch {
      // 拦截器已提示
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await wikiApi.deleteTemplate(deleteTarget.id)
    toast.success('模板已删除')
    void load()
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-xl font-semibold text-ink-1">页面模板</h1>
      <p className="mt-1 text-meta text-ink-3">
        基于模板一键创建结构相同的页面；模板可在页面中通过「另存为模板」生成
      </p>

      {items === null && (
        <div className="mt-8 flex justify-center">
          <Spinner size={20} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-card bg-sunken py-16 text-ink-3">
          <LayoutTemplate size={34} />
          <p className="mt-3 text-sm">还没有模板</p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex flex-col rounded-card border border-line bg-surface p-5 transition-all hover:border-brand/40 hover:shadow-2"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctrl bg-brand-light text-brand">
                  <LayoutTemplate size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-1">{t.title}</p>
                  <p className="mt-0.5 line-clamp-2 min-h-[2em] text-meta text-ink-3">
                    {t.description || '暂无描述'}
                  </p>
                </div>
                <button
                  type="button"
                  title="删除模板"
                  className="shrink-0 rounded-ctrl p-1.5 text-ink-3 transition-colors hover:bg-danger-light hover:text-danger"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="truncate text-meta text-ink-3">
                  {t.createdByName ?? '未知'} · {fmtTs(t.createdAt)}
                </span>
                <Button size="sm" variant="primary" onClick={() => setUseTemplate(t)}>
                  从模板新建页面
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 从模板新建页面 */}
      {useTemplate && (
        <CreateFromTemplateDialog
          template={useTemplate}
          onClose={() => setUseTemplate(null)}
        />
      )}

      {/* 删除模板确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除模板"
        danger
        confirmText="删除"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        content={
          deleteTarget
            ? `确定删除模板「${deleteTarget.title}」吗？已用它创建的页面不受影响。`
            : ''
        }
      />
    </div>
  )
}
