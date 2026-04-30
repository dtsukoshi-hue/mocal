-- ============================================================
-- order_items にコンボ参照を追加
-- 注文時にコンボの一部として追加された行を識別できるようにする。
-- combo_id: 注文時点のコンボへの参照（コンボが削除されても注文記録は残す）
-- combo_label: スナップショット（コンボ名・将来のリネームに耐えるため）
-- ============================================================
alter table order_items
  add column if not exists combo_id    uuid references combo_offers(id),
  add column if not exists combo_label text;

create index if not exists idx_order_items_combo_id on order_items (combo_id);
