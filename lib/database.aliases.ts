/**
 * mocal — Database 型エイリアス
 *
 * `lib/database.types.ts` は `supabase gen types` で自動生成される
 * (AGENTS.md「手書きで lib/database.types.ts を編集しない」)。
 * しかし auto-generated 型には:
 *  1. アプリ側で多用する短い別名 (Order / Store / MenuItem ...) が無い
 *  2. DB が text / int で保存している enum 相当が string / number にしか narrow されない
 *
 * このファイルが両方を補う:
 *  - Row / Insert は Database['public']['Tables'][X] を参照する形 → 自動追従
 *  - enum 相当は literal union として narrow（DB が text なので型安全はここで担保）
 *
 * 新規エイリアスは必ず以下のルールで:
 *  - フィールド一覧を直接書かない（database.types が真実）
 *  - 必ず `Tables['<table>']['Row']` 等を参照
 *  - enum 相当の narrow は `Omit<Row, K> & { K: <Union> }` パターン
 */

import type { Database } from './database.types'

type Tables = Database['public']['Tables']

// ============================================================
// Literal Unions
//   DB は text/int で保存しているが、アプリ側は narrow する。
//   仕様変更時はここを更新し、対応する migration を /supabase/migrations/ に追加する。
// ============================================================

/** 注文ステータス（仕様書 §14.2 / lib/validation.ts と整合） */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'no_show'

/** 受取方法 */
export type PickupType = 'standard' | 'scheduled'

/** キャンセル理由種別 */
export type CancelledReasonType =
  | 'store_closed'
  | 'out_of_stock'
  | 'store_cancel'      // 店舗スタッフによる手動キャンセル
  | 'user_cancel'
  | 'timeout'
  | 'payment_failed'
  | 'amount_mismatch'

/** 店舗メンバーの権限 */
export type StoreRole = 'owner' | 'staff'

/** 受取目安時間（分）— UI で選択可能な値のみ */
export type WaitMinutes = 10 | 15 | 20 | 30 | 40 | 60

/** JS getDay() 互換: 0=日, 1=月, ..., 6=土 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

// ============================================================
// Row types — Database 参照 + enum 相当を narrow
// ============================================================

export type Order = Omit<
  Tables['orders']['Row'],
  'status' | 'pickup_type' | 'cancelled_reason_type'
> & {
  status: OrderStatus
  pickup_type: PickupType
  cancelled_reason_type: CancelledReasonType | null
}

export type Store = Omit<Tables['stores']['Row'], 'wait_minutes'> & {
  wait_minutes: WaitMinutes
}

export type StoreMember = Omit<Tables['store_members']['Row'], 'role'> & {
  role: StoreRole
}

export type StoreHour = Omit<Tables['store_hours']['Row'], 'weekday'> & {
  weekday: Weekday
}

export type MenuItem = Tables['menu_items']['Row']
export type OrderItem = Tables['order_items']['Row']
export type Profile = Tables['profiles']['Row']
export type ComboOffer = Tables['combo_offers']['Row']
export type ComboOfferItem = Tables['combo_offer_items']['Row']
export type ProcessedWebhookEvent = Tables['processed_webhook_events']['Row']

// ============================================================
// Insert types
// ============================================================

export type OrderInsert = Tables['orders']['Insert']
export type OrderItemInsert = Tables['order_items']['Insert']
export type StoreInsert = Tables['stores']['Insert']
export type MenuItemInsert = Tables['menu_items']['Insert']
export type ProfileInsert = Tables['profiles']['Insert']
export type ComboOfferInsert = Tables['combo_offers']['Insert']
export type ComboOfferItemInsert = Tables['combo_offer_items']['Insert']
