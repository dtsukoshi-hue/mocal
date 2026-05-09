-- ============================================================
-- インデックス整理：不要インデックス削除 & メニュー並び順最適化
-- ============================================================

-- no_show → completed 自動遷移を削除したため不要になったインデックスを削除
DROP INDEX IF EXISTS idx_orders_no_show_at;

-- menu_items の並び順クエリ最適化
-- SELECT * FROM menu_items WHERE store_id = ? ORDER BY sort_order ASC, created_at ASC
-- 既存の idx_menu_items_store_id では ORDER BY にインデックスが効かないため、
-- 複合インデックスでソートも含めてカバー
CREATE INDEX IF NOT EXISTS idx_menu_items_store_sort
  ON menu_items(store_id, sort_order, created_at);

-- 注文履歴・レポートの時系列クエリ最適化
-- SELECT ... FROM orders WHERE store_id = ? AND status IN (...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON orders(store_id, created_at DESC);
