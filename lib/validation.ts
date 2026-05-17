import type { OrderStatus, WaitMinutes } from './database.types'

// ---------------------------------------------------------------------------
// 注文ステータス遷移ルール（仕様書 §14.2 / §14.3 に基づく）
// ---------------------------------------------------------------------------

export const VALID_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid:      ['accepted', 'cancelled'],
  accepted:  ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed', 'no_show'],
}

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'pending', 'paid', 'accepted', 'preparing', 'ready',
  'completed', 'cancelled', 'refunded', 'no_show',
]

/** 店舗スタッフが PATCH /api/orders/[id] で指定できるステータス */
export const STAFF_SETTABLE_STATUSES = new Set<OrderStatus>([
  'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'no_show',
])

/**
 * 指定した遷移が許可されているか検証する。
 * - VALID_ORDER_TRANSITIONS に定義されていない遷移は全て不可
 * - 同一ステータスへの遷移（no-op）は不可
 */
export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  const allowed = VALID_ORDER_TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

// ---------------------------------------------------------------------------
// 待ち時間の許容値
// ---------------------------------------------------------------------------

export const VALID_WAIT_MINUTES: WaitMinutes[] = [10, 15, 20, 30, 40, 60]

export function isValidWaitMinutes(value: number): value is WaitMinutes {
  return VALID_WAIT_MINUTES.includes(value as WaitMinutes)
}

// ---------------------------------------------------------------------------
// UUID バリデーション
// ---------------------------------------------------------------------------

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

/**
 * /api/orders/lookup で使う: localStorage 由来の id リストを正規化
 *  - UUID のみ通す
 *  - 重複除去
 *  - max 件を超えたら 'too_many' を返す
 */
export type NormalizeLookupResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'invalid' | 'too_many' }

export function normalizeLookupIds(input: unknown, max: number): NormalizeLookupResult {
  if (!Array.isArray(input)) return { ok: false, reason: 'invalid' }
  if (input.length > max) return { ok: false, reason: 'too_many' }
  const uniq = new Set<string>()
  for (const v of input) {
    if (typeof v === 'string' && UUID_REGEX.test(v)) uniq.add(v)
  }
  return { ok: true, ids: Array.from(uniq) }
}
