-- ダッシュボード: store_id + status の複合クエリ高速化
CREATE INDEX IF NOT EXISTS idx_orders_store_status
  ON orders(store_id, status);

-- Cron (no-show): ready_at の範囲クエリ
CREATE INDEX IF NOT EXISTS idx_orders_ready_at
  ON orders(ready_at)
  WHERE status = 'ready';

-- Cron (no-show cleanup): no_show_at の範囲クエリ
CREATE INDEX IF NOT EXISTS idx_orders_no_show_at
  ON orders(no_show_at)
  WHERE status = 'no_show';

-- Cron (scheduled alert): scheduled_at + status 複合クエリ
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_at
  ON orders(scheduled_at)
  WHERE status = 'paid' AND pickup_type = 'scheduled';

-- Cron (pending timeout): pending 注文の created_at 範囲クエリ
CREATE INDEX IF NOT EXISTS idx_orders_pending_created
  ON orders(created_at)
  WHERE status = 'pending';

-- Stripe webhook: payment_intent_id でのルックアップ
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Stripe webhook (charge.refunded): charge_id でのルックアップ
CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge
  ON orders(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;
