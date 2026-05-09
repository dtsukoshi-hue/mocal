-- WebPush 購読情報テーブル
-- ユーザー（注文ごと）と店舗（店舗ごと）の push subscription を保存する

CREATE TABLE push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid        REFERENCES stores(id) ON DELETE CASCADE,
  order_id   uuid        REFERENCES orders(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth_key   text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  -- store_id か order_id のいずれか一方のみ設定可能
  CONSTRAINT push_subscriptions_target_check
    CHECK (
      (store_id IS NOT NULL AND order_id IS NULL) OR
      (store_id IS NULL AND order_id IS NOT NULL)
    ),
  -- 同一デバイス（endpoint）が同一注文・同一店舗に重複登録しない
  CONSTRAINT push_subscriptions_endpoint_order_unique  UNIQUE (endpoint, order_id),
  CONSTRAINT push_subscriptions_endpoint_store_unique  UNIQUE (endpoint, store_id)
);

CREATE INDEX idx_push_subscriptions_order_id ON push_subscriptions(order_id);
CREATE INDEX idx_push_subscriptions_store_id ON push_subscriptions(store_id);

-- 店舗は自分の店舗に紐付く subscription を参照・削除できる
CREATE POLICY "store_own_push_subscriptions" ON push_subscriptions
  FOR ALL USING (
    store_id IN (
      SELECT store_id FROM store_members WHERE user_id = auth.uid()
    )
  );
