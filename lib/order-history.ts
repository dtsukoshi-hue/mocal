// クライアント側の注文履歴管理（localStorage ベース）
// サーバー側で order_number からの検索を許可すると列挙攻撃のリスクがあるため、
// 顧客のブラウザに限定して履歴を保持する。
//
// 保存内容は最小限（id と保存タイムスタンプのみ）。
// 表示時はサーバーから最新ステータスを取得する。

const STORAGE_KEY = 'mocal:order_history'
const MAX_ENTRIES = 20            // 過剰なローカルストレージ占有を防ぐ
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 日

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface StoredOrder {
  id: string         // 注文 UUID
  savedAt: number    // 保存時刻（ms）
}

function isStoredOrder(v: unknown): v is StoredOrder {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string'
    && UUID_REGEX.test(o.id)
    && typeof o.savedAt === 'number'
    && Number.isFinite(o.savedAt)
}

function safeParse(raw: string | null): StoredOrder[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredOrder)
  } catch {
    return []
  }
}

function prune(list: StoredOrder[]): StoredOrder[] {
  const now = Date.now()
  return list
    .filter(e => now - e.savedAt < RETENTION_MS)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_ENTRIES)
}

export function getOrderHistory(): StoredOrder[] {
  if (typeof window === 'undefined') return []
  try {
    return prune(safeParse(window.localStorage.getItem(STORAGE_KEY)))
  } catch {
    return []
  }
}

export function saveOrderToHistory(orderId: string): void {
  if (typeof window === 'undefined') return
  if (!UUID_REGEX.test(orderId)) return
  try {
    const current = safeParse(window.localStorage.getItem(STORAGE_KEY))
    // 既存エントリは新しいタイムスタンプで上書き
    const filtered = current.filter(e => e.id !== orderId)
    const next = prune([{ id: orderId, savedAt: Date.now() }, ...filtered])
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage が無効・容量超過などは無視
  }
}

export function removeOrderFromHistory(orderId: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = safeParse(window.localStorage.getItem(STORAGE_KEY))
    const next = current.filter(e => e.id !== orderId)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 無視
  }
}
