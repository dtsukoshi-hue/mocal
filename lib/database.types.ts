// mocal — Supabase データベース型定義
// supabase gen types typescript で自動生成する代わりに手動管理

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

export type PickupType = 'standard' | 'scheduled'

export type CancelledReasonType =
  | 'store_closed'
  | 'out_of_stock'
  | 'user_cancel'
  | 'timeout'
  | 'payment_failed'
  | 'amount_mismatch'

export type StoreRole = 'owner' | 'staff'

export type WaitMinutes = 10 | 15 | 20 | 30 | 40 | 60

// ------------------------------------------------------------
// テーブル行型
// supabase-js v2 の GenericTable 制約を満たすために interface ではなく type を使用
// （TypeScript の interface は Record<string, unknown> の暗黙インデックスシグネチャを持たないため）
// ------------------------------------------------------------

export type Store = {
  id: string
  name: string
  stripe_account_id: string | null
  is_open: boolean
  wait_minutes: WaitMinutes
  created_at: string
}

export type Profile = {
  id: string
  phone: string | null
  nickname: string | null
  created_at: string
}

export type StoreMember = {
  id: string
  store_id: string
  user_id: string
  role: StoreRole
}

export type MenuItem = {
  id: string
  store_id: string
  name: string
  price: number
  description: string | null
  category: string | null
  emoji: string | null
  image_url: string | null
  is_available: boolean
  sort_order: number
  created_at: string
}

export type Order = {
  id: string
  order_number: number
  store_id: string
  user_id: string | null   // null = ゲスト注文
  status: OrderStatus
  pickup_type: PickupType
  scheduled_at: string | null
  total_amount: number
  estimated_ready_at: string | null
  accepted_at: string | null
  ready_at: string | null
  no_show_at: string | null
  cancelled_reason_type: CancelledReasonType | null
  cancelled_reason_detail: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  customer_note: string | null
  created_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  menu_item_id: string | null  // 削除されたメニューは null
  name: string                  // スナップショット
  price: number                 // スナップショット
  qty: number
}

export type ProcessedWebhookEvent = {
  stripe_event_id: string
  processed_at: string
}

export type PushSubscription = {
  id: string
  store_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export type StaffAccount = {
  id: string
  store_id: string
  email: string
  password_hash: string
  role: 'owner' | 'staff'
  created_at: string
}

export type OrderPushSubscription = {
  id: string
  order_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

// ------------------------------------------------------------
// INSERT 用型（id / created_at を省略可能）
// ------------------------------------------------------------

export type StoreInsert = Omit<Store, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type ProfileInsert = Omit<Profile, 'created_at'> & {
  created_at?: string
}

export type MenuItemInsert = Omit<MenuItem, 'id' | 'created_at' | 'image_url'> & {
  id?: string
  created_at?: string
  image_url?: string | null
}

export type OrderInsert = {
  id?: string
  order_number?: number
  store_id: string
  user_id: string | null
  status: OrderStatus
  pickup_type: PickupType
  scheduled_at?: string | null
  total_amount: number
  estimated_ready_at?: string | null
  accepted_at?: string | null
  ready_at?: string | null
  no_show_at?: string | null
  cancelled_reason_type?: CancelledReasonType | null
  cancelled_reason_detail?: string | null
  stripe_payment_intent_id?: string | null
  stripe_charge_id?: string | null
  customer_note?: string | null
  created_at?: string
}

export type OrderItemInsert = Omit<OrderItem, 'id'> & {
  id?: string
}

// ------------------------------------------------------------
// Supabase Database 型（クライアント生成用）
// supabase-js v2 が要求する完全な構造
// ------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: Store
        Insert: StoreInsert
        Update: Partial<StoreInsert>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: Partial<ProfileInsert>
        Relationships: []
      }
      store_members: {
        Row: StoreMember
        Insert: Omit<StoreMember, 'id'> & { id?: string }
        Update: Partial<Omit<StoreMember, 'id'>>
        Relationships: []
      }
      menu_items: {
        Row: MenuItem
        Insert: MenuItemInsert
        Update: Partial<MenuItemInsert>
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: OrderInsert
        Update: Partial<OrderInsert>
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: OrderItem
        Insert: OrderItemInsert
        Update: Partial<OrderItemInsert>
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      processed_webhook_events: {
        Row: ProcessedWebhookEvent
        Insert: Omit<ProcessedWebhookEvent, 'processed_at'> & { processed_at?: string }
        Update: Partial<ProcessedWebhookEvent>
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscription
        Insert: Omit<PushSubscription, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<PushSubscription, 'id'>>
        Relationships: []
      }
      staff_accounts: {
        Row: StaffAccount
        Insert: Omit<StaffAccount, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<StaffAccount, 'id'>>
        Relationships: []
      }
      order_push_subscriptions: {
        Row: OrderPushSubscription
        Insert: Omit<OrderPushSubscription, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<OrderPushSubscription, 'id'>>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
