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
  | 'store_cancel'    // 店舗スタッフによる手動キャンセル
  | 'user_cancel'
  | 'timeout'
  | 'payment_failed'
  | 'amount_mismatch'

export type StoreRole = 'owner' | 'staff'

export type WaitMinutes = 10 | 15 | 20 | 30 | 40 | 60

// ------------------------------------------------------------
// テーブル行型（type を使用 — interface は Record<string,unknown> を満たさない）
// ------------------------------------------------------------

export type Store = {
  id: string
  name: string
  slug: string | null
  description: string | null
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
  description: string | null
  price: number
  category: string | null
  emoji: string | null
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
  customer_note: string | null
  total_amount: number
  estimated_ready_at: string | null
  accepted_at: string | null
  ready_at: string | null
  no_show_at: string | null
  cancelled_reason_type: CancelledReasonType | null
  cancelled_reason_detail: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  alert_30min_sent: boolean
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

// ------------------------------------------------------------
// INSERT 用型（nullable フィールドはオプション）
// ------------------------------------------------------------

export type StoreInsert = {
  id?: string
  name: string
  slug?: string | null
  description?: string | null
  stripe_account_id?: string | null
  is_open?: boolean
  wait_minutes?: WaitMinutes
  created_at?: string
}

export type ProfileInsert = {
  id: string
  phone?: string | null
  nickname?: string | null
  created_at?: string
}

export type MenuItemInsert = {
  id?: string
  store_id: string
  name: string
  description?: string | null
  price: number
  category?: string | null
  emoji?: string | null
  is_available?: boolean
  sort_order?: number
  created_at?: string
}

export type OrderInsert = {
  id?: string
  order_number?: number
  store_id: string
  user_id?: string | null
  status?: OrderStatus
  pickup_type: PickupType
  scheduled_at?: string | null
  customer_note?: string | null
  total_amount: number
  estimated_ready_at?: string | null
  accepted_at?: string | null
  ready_at?: string | null
  no_show_at?: string | null
  cancelled_reason_type?: CancelledReasonType | null
  cancelled_reason_detail?: string | null
  stripe_payment_intent_id?: string | null
  stripe_charge_id?: string | null
  alert_30min_sent?: boolean
  created_at?: string
}

export type OrderItemInsert = {
  id?: string
  order_id: string
  menu_item_id?: string | null
  name: string
  price: number
  qty: number
}

// ------------------------------------------------------------
// Supabase Database 型（クライアント生成用）
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
        Relationships: [
          {
            foreignKeyName: 'store_members_store_id_fkey'
            columns: ['store_id']
            isOneToOne: false
            referencedRelation: 'stores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'store_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      menu_items: {
        Row: MenuItem
        Insert: MenuItemInsert
        Update: Partial<MenuItemInsert>
        Relationships: [
          {
            foreignKeyName: 'menu_items_store_id_fkey'
            columns: ['store_id']
            isOneToOne: false
            referencedRelation: 'stores'
            referencedColumns: ['id']
          }
        ]
      }
      orders: {
        Row: Order
        Insert: OrderInsert
        Update: Partial<OrderInsert>
        Relationships: [
          {
            foreignKeyName: 'orders_store_id_fkey'
            columns: ['store_id']
            isOneToOne: false
            referencedRelation: 'stores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      order_items: {
        Row: OrderItem
        Insert: OrderItemInsert
        Update: Partial<OrderItemInsert>
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_menu_item_id_fkey'
            columns: ['menu_item_id']
            isOneToOne: false
            referencedRelation: 'menu_items'
            referencedColumns: ['id']
          }
        ]
      }
      processed_webhook_events: {
        Row: ProcessedWebhookEvent
        Insert: { stripe_event_id: string; processed_at?: string }
        Update: never
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          store_id: string | null
          order_id: string | null
          endpoint: string
          p256dh: string
          auth_key: string
          created_at: string
        }
        Insert: {
          id?: string
          store_id?: string | null
          order_id?: string | null
          endpoint: string
          p256dh: string
          auth_key: string
          created_at?: string
        }
        Update: {
          endpoint?: string
          p256dh?: string
          auth_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_store_id_fkey'
            columns: ['store_id']
            isOneToOne: false
            referencedRelation: 'stores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'push_subscriptions_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {}
    Functions: {
      get_user_id_by_email: {
        Args: { p_email: string }
        Returns: string | null
      }
    }
  }
}
