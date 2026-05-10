-- cancelled_reason_type に 'store_cancel' を追加
-- 店舗スタッフが手動キャンセルした場合に使用する

-- CHECK 制約を作り直し（PostgreSQL は ALTER CHECK 制約を直接変更できない）
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_cancelled_reason_type_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_cancelled_reason_type_check
    CHECK (cancelled_reason_type IN (
      'store_closed', 'out_of_stock', 'store_cancel',
      'user_cancel', 'timeout', 'payment_failed', 'amount_mismatch'
    ));
