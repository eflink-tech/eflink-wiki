// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  isNewerAppVersion,
  parseVersionPayload,
  startVersionPolling,
} from './appVersion'

describe('parseVersionPayload', () => {
  it('读取 version 字段', () => {
    expect(parseVersionPayload({ version: 'abc123' })).toBe('abc123')
  })

  it('非法载荷返回 null', () => {
    expect(parseVersionPayload(null)).toBeNull()
    expect(parseVersionPayload({})).toBeNull()
    expect(parseVersionPayload({ version: '' })).toBeNull()
    expect(parseVersionPayload({ version: 1 })).toBeNull()
  })
})

describe('isNewerAppVersion', () => {
  it('远程版本与当前不同则需要刷新', () => {
    expect(isNewerAppVersion('old', 'new')).toBe(true)
  })

  it('相同或缺失则不提示', () => {
    expect(isNewerAppVersion('same', 'same')).toBe(false)
    expect(isNewerAppVersion(undefined, 'new')).toBe(false)
    expect(isNewerAppVersion('old', null)).toBe(false)
  })
})

describe('startVersionPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('发现新版本时只通知一次', async () => {
    const onNewer = vi.fn()
    const stop = startVersionPolling({
      current: 'v1',
      intervalMs: 1000,
      fetchVersion: async () => ({ version: 'v2' }),
      onNewer,
    })
    await vi.runOnlyPendingTimersAsync()
    expect(onNewer).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(onNewer).toHaveBeenCalledTimes(1)
    stop()
  })

  it('版本未变化不通知', async () => {
    const onNewer = vi.fn()
    const stop = startVersionPolling({
      current: 'v1',
      intervalMs: 1000,
      fetchVersion: async () => ({ version: 'v1' }),
      onNewer,
    })
    await vi.runOnlyPendingTimersAsync()
    expect(onNewer).not.toHaveBeenCalled()
    stop()
  })
})
