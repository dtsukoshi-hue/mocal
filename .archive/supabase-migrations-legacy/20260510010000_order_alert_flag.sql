-- 時間指定注文の30分前アラートを一度だけ送るためのフラグ
-- cron が1分ごとに走るため、フラグなしでは10回重複通知が起きる
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS alert_30min_sent boolean NOT NULL DEFAULT false;

-- クエリで未送信かつ対象ウィンドウを絞るためのインデックス
CREATE INDEX IF NOT EXISTS idx_orders_alert_flag
  ON orders(store_id, scheduled_at)
  WHERE status = 'paid'
    AND pickup_type = 'scheduled'
    AND alert_30min_sent = false;
