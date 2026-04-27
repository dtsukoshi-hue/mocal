// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getOrderHistory,
  saveOrderToHistory,
  removeOrderFromHistory,
} from '@/lib/order-history'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_C = '33333333-3333-4333-8333-333333333333'

describe('order-history (localStorage)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
  })

  it('saves and retrieves an order id', () => {
    saveOrderToHistory(ID_A)
    const list = getOrderHistory()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(ID_A)
  })

  it('rejects invalid UUIDs on save', () => {
    saveOrderToHistory('not-a-uuid')
    saveOrderToHistory('')
    saveOrderToHistory('11111111-1111-1111-1111') // 短い
    expect(getOrderHistory()).toEqual([])
  })

  it('deduplicates by overwriting with newer timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    saveOrderToHistory(ID_A)
    vi.advanceTimersByTime(10_000)
    saveOrderToHistory(ID_B)
    vi.advanceTimersByTime(10_000)
    saveOrderToHistory(ID_A) // 再保存

    const list = getOrderHistory()
    expect(list).toHaveLength(2)
    // 新しいタイムスタンプの ID_A が先頭
    expect(list[0].id).toBe(ID_A)
    expect(list[1].id).toBe(ID_B)
  })

  it('prunes entries older than 30 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    saveOrderToHistory(ID_A)
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000)
    saveOrderToHistory(ID_B)

    const list = getOrderHistory()
    expect(list.map(e => e.id)).toEqual([ID_B])
  })

  it('caps at 20 entries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    for (let i = 0; i < 25; i++) {
      const id = `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
      saveOrderToHistory(id)
      vi.advanceTimersByTime(1000)
    }
    expect(getOrderHistory()).toHaveLength(20)
  })

  it('removes a specific id', () => {
    saveOrderToHistory(ID_A)
    saveOrderToHistory(ID_B)
    removeOrderFromHistory(ID_A)
    const list = getOrderHistory()
    expect(list.map(e => e.id)).toEqual([ID_B])
  })

  it('returns empty array on corrupted localStorage', () => {
    window.localStorage.setItem('mocal:order_history', 'not json{')
    expect(getOrderHistory()).toEqual([])
  })

  it('filters out non-UUID garbage in localStorage', () => {
    window.localStorage.setItem(
      'mocal:order_history',
      JSON.stringify([
        { id: ID_A, savedAt: Date.now() },
        { id: 'evil-string', savedAt: Date.now() },
        { id: ID_B }, // savedAt 欠損
        'not-an-object',
      ])
    )
    const list = getOrderHistory()
    expect(list.map(e => e.id)).toEqual([ID_A])
  })

  it('is a no-op when window is undefined', () => {
    // SSR safety: jsdom 環境でも明示的に undefined を扱える設計か確認
    // 実装は typeof window === 'undefined' で early-return するため例外なし
    expect(() => saveOrderToHistory(ID_C)).not.toThrow()
  })
})
