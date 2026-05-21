export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      combo_offer_items: {
        Row: {
          combo_id: string
          id: string
          menu_item_id: string
          qty: number
        }
        Insert: {
          combo_id: string
          id?: string
          menu_item_id: string
          qty?: number
        }
        Update: {
          combo_id?: string
          id?: string
          menu_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_offer_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combo_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_offer_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_offers: {
        Row: {
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_available: boolean
          name: string
          price_delta: number
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_available?: boolean
          name: string
          price_delta?: number
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_available?: boolean
          name?: string
          price_delta?: number
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number
          sort_order: number
          store_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price: number
          sort_order?: number
          store_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          combo_id: string | null
          combo_label: string | null
          id: string
          menu_item_id: string | null
          name: string
          order_id: string
          price: number
          qty: number
        }
        Insert: {
          combo_id?: string | null
          combo_label?: string | null
          id?: string
          menu_item_id?: string | null
          name: string
          order_id: string
          price: number
          qty: number
        }
        Update: {
          combo_id?: string | null
          combo_label?: string | null
          id?: string
          menu_item_id?: string | null
          name?: string
          order_id?: string
          price?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combo_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          order_id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          order_id: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          order_id?: string
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_push_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          alert_30min_sent: boolean
          cancelled_reason_detail: string | null
          cancelled_reason_type: string | null
          created_at: string
          customer_note: string | null
          estimated_ready_at: string | null
          id: string
          no_show_at: string | null
          order_number: number
          pickup_type: string
          ready_at: string | null
          scheduled_at: string | null
          status: string
          store_id: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_receipt_url: string | null
          total_amount: number
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          alert_30min_sent?: boolean
          cancelled_reason_detail?: string | null
          cancelled_reason_type?: string | null
          created_at?: string
          customer_note?: string | null
          estimated_ready_at?: string | null
          id?: string
          no_show_at?: string | null
          order_number?: number
          pickup_type: string
          ready_at?: string | null
          scheduled_at?: string | null
          status?: string
          store_id: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          total_amount: number
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          alert_30min_sent?: boolean
          cancelled_reason_detail?: string | null
          cancelled_reason_type?: string | null
          created_at?: string
          customer_note?: string | null
          estimated_ready_at?: string | null
          id?: string
          no_show_at?: string | null
          order_number?: number
          pickup_type?: string
          ready_at?: string | null
          scheduled_at?: string | null
          status?: string
          store_id?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          total_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          processed_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nickname: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nickname?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nickname?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          order_id: string | null
          p256dh: string
          store_id: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          order_id?: string | null
          p256dh: string
          store_id?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          order_id?: string | null
          p256dh?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_hours: {
        Row: {
          close_time: string | null
          created_at: string
          id: string
          is_open: boolean
          last_order: string | null
          open_time: string | null
          store_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          last_order?: string | null
          open_time?: string | null
          store_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          close_time?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          last_order?: string | null
          open_time?: string | null
          store_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_hours_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          id: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          area: string | null
          cover_url: string | null
          created_at: string
          cuisine_type: string | null
          description: string | null
          id: string
          is_open: boolean
          logo_url: string | null
          manual_override_until: string | null
          name: string
          slug: string | null
          stripe_account_id: string | null
          wait_minutes: number
        }
        Insert: {
          area?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          manual_override_until?: string | null
          name: string
          slug?: string | null
          stripe_account_id?: string | null
          wait_minutes?: number
        }
        Update: {
          area?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          manual_override_until?: string | null
          name?: string
          slug?: string | null
          stripe_account_id?: string | null
          wait_minutes?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      should_be_open: { Args: { p_store_id: string }; Returns: boolean }
      sync_store_open_status: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
