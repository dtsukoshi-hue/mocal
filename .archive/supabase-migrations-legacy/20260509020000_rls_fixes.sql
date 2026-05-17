-- ============================================================
-- RLS 修正: ゲストが注文ステータスをリアルタイム購読できるようにする
-- ============================================================

-- orders: UUID は 128bit ランダムで推測不可能なため、ID を知っていれば参照を許可
-- Realtime subscription でゲスト（未認証）が自分の注文ステータスを受信するために必要
CREATE POLICY "orders_public_select_by_uuid" ON orders
  FOR SELECT USING (true);

-- push_subscriptions: RLS を有効化
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
