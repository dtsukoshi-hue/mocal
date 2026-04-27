// 純粋なバリデーションユーティリティ（DB やネットワーク依存なし）
// API ルートと共有することでテスト容易にする。

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v)
}

// 注文照会のリクエスト ids を検証・正規化（重複除去・UUID のみ通す）
export function normalizeLookupIds(input: unknown, max = 20):
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'not_array' | 'too_many' } {
  if (!Array.isArray(input)) return { ok: false, reason: 'not_array' }
  const ids = Array.from(new Set(input.filter(isUuid)))
  if (ids.length > max) return { ok: false, reason: 'too_many' }
  return { ok: true, ids }
}

// 注文ステータス遷移検証（ソース・オブ・トゥルース）
import type { OrderStatus } from './database.types'

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'pending', 'paid', 'accepted', 'preparing', 'ready',
  'completed', 'cancelled', 'refunded', 'no_show',
]

export const VALID_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid:      ['accepted', 'cancelled'],
  accepted:  ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed', 'no_show'],
}

export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_TRANSITIONS[from]?.includes(to) ?? false
}
