-- cancelled_reason_type の CHECK 制約に 'store_cancel' を追加する
-- 元の制約を削除して再作成する（PostgreSQL は CHECK 制約の ALTER を直接サポートしない）

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_cancelled_reason_type_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_cancelled_reason_type_check
  CHECK (cancelled_reason_type IN (
    'store_closed', 'out_of_stock', 'store_cancel',
    'user_cancel', 'timeout', 'payment_failed', 'amount_mismatch'
  ));
