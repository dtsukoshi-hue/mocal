-- ============================================================
-- mocal — 初期スキーマ
-- Phase 1 MVP: テイクアウト事前注文プラットフォーム
-- ============================================================

-- ------------------------------------------------------------
-- 拡張機能
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- ENUM 的な制約用ドメイン（CHECK制約で実装）
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- stores テーブル
-- ------------------------------------------------------------
CREATE TABLE stores (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  stripe_account_id  text,                          -- Stripe Connect アカウント ID
  is_open            boolean     NOT NULL DEFAULT false,
  wait_minutes       int         NOT NULL DEFAULT 15
                                 CHECK (wait_minutes IN (10, 15, 20, 30, 40, 60)),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- profiles テーブル（auth.users と 1:1）
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone      text,
  nickname   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- store_members テーブル（RLS 判定用）
-- ------------------------------------------------------------
CREATE TABLE store_members (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid  NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text  NOT NULL DEFAULT 'staff'
                   CHECK (role IN ('owner', 'staff')),
  UNIQUE (store_id, user_id)
);

-- ------------------------------------------------------------
-- menu_items テーブル
-- ------------------------------------------------------------
CREATE TABLE menu_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  price        int         NOT NULL CHECK (price >= 0),
  category     text,
  emoji        text,
  is_available boolean     NOT NULL DEFAULT true,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- orders テーブル
-- ------------------------------------------------------------
CREATE TABLE orders (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number             int         NOT NULL,
  store_id                 uuid        NOT NULL REFERENCES stores(id),
  user_id                  uuid        REFERENCES profiles(id),  -- nullable（ゲスト注文）
  status                   text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN (
                                         'pending', 'paid', 'accepted', 'preparing',
                                         'ready', 'completed', 'cancelled', 'refunded', 'no_show'
                                       )),
  pickup_type              text        NOT NULL
                                       CHECK (pickup_type IN ('standard', 'scheduled')),
  scheduled_at             timestamptz,
  total_amount             int         NOT NULL CHECK (total_amount >= 0),
  estimated_ready_at       timestamptz,           -- accepted 時に確定
  accepted_at              timestamptz,
  ready_at                 timestamptz,
  no_show_at               timestamptz,
  cancelled_reason_type    text
                                       CHECK (cancelled_reason_type IN (
                                         'store_closed', 'out_of_stock', 'user_cancel',
                                         'timeout', 'payment_failed', 'amount_mismatch'
                                       )),
  cancelled_reason_detail  text,
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- order_number は店舗ごとに連番（MVP: グローバルシーケンスで代用）
CREATE SEQUENCE order_number_seq START 1000;
ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT nextval('order_number_seq');

-- ------------------------------------------------------------
-- order_items テーブル（注文時スナップショット）
-- ------------------------------------------------------------
CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id   uuid REFERENCES menu_items(id),  -- 削除時 nullable
  name           text NOT NULL,                   -- スナップショット
  price          int  NOT NULL CHECK (price >= 0), -- スナップショット
  qty            int  NOT NULL CHECK (qty >= 1)
);

-- ------------------------------------------------------------
-- processed_webhook_events テーブル（冪等性保証）
-- ------------------------------------------------------------
CREATE TABLE processed_webhook_events (
  stripe_event_id text        PRIMARY KEY,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- インデックス
-- ------------------------------------------------------------
CREATE INDEX idx_orders_store_id  ON orders(store_id);
CREATE INDEX idx_orders_user_id   ON orders(user_id);
CREATE INDEX idx_orders_status    ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_menu_items_store_id ON menu_items(store_id);
CREATE INDEX idx_store_members_user_id ON store_members(user_id);
CREATE INDEX idx_store_members_store_id ON store_members(store_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE stores                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- stores ポリシー
-- ------------------------------------------------------------
-- 誰でも店舗情報を参照可能
CREATE POLICY "stores_public_read" ON stores
  FOR SELECT USING (true);

-- 店舗メンバーは自店舗を更新可能
CREATE POLICY "stores_member_update" ON stores
  FOR UPDATE USING (
    id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- profiles ポリシー
-- ------------------------------------------------------------
-- 自分のプロフィールのみ参照・更新可能
CREATE POLICY "profiles_own_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 新規ユーザーは自分のプロフィールを作成可能
CREATE POLICY "profiles_own_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------
-- store_members ポリシー
-- ------------------------------------------------------------
-- 店舗メンバー情報は自分が所属する店舗のものだけ参照可能
CREATE POLICY "store_members_own_read" ON store_members
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- menu_items ポリシー
-- ------------------------------------------------------------
-- 誰でもメニューを参照可能（is_available に関わらず全件：フロントでフィルタ）
CREATE POLICY "menu_items_public_read" ON menu_items
  FOR SELECT USING (true);

-- 店舗メンバーは自店舗のメニューを参照・更新・追加可能（削除は service_role のみ）
CREATE POLICY "menu_items_store_member_select" ON menu_items
  FOR SELECT USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

CREATE POLICY "menu_items_store_member_insert" ON menu_items
  FOR INSERT WITH CHECK (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

CREATE POLICY "menu_items_store_member_update" ON menu_items
  FOR UPDATE USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- orders ポリシー
-- ------------------------------------------------------------
-- ログインユーザーは自分の注文を参照可能
CREATE POLICY "orders_user_own_select" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- 店舗メンバーは自店舗の注文を参照・ステータス更新のみ可能（INSERT/DELETE は service_role のみ）
CREATE POLICY "orders_store_member_select" ON orders
  FOR SELECT USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

CREATE POLICY "orders_store_member_update" ON orders
  FOR UPDATE USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- order_items ポリシー
-- ------------------------------------------------------------
-- ログインユーザーは自分の注文の明細を参照可能
CREATE POLICY "order_items_user_own_select" ON order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
  );

-- 店舗メンバーは自店舗の注文明細を参照のみ可能（INSERT/DELETE は service_role のみ）
CREATE POLICY "order_items_store_member_select" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN store_members sm ON sm.store_id = o.store_id
      WHERE sm.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- processed_webhook_events ポリシー
-- ------------------------------------------------------------
-- service_role のみアクセス可能（RLS でユーザーアクセスを全拒否）
-- ※ Supabase Edge Functions / サーバーサイドは service_role キーで RLS をバイパス

-- ============================================================
-- auth.users トリガー（profiles 自動作成）
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, phone)
  VALUES (
    NEW.id,
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
