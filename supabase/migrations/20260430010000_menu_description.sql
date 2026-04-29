-- ============================================================
-- menu_items に説明文カラムを追加（プロトタイプの「3000日かけて完成…」等）
-- ============================================================
alter table menu_items
  add column if not exists description text check (char_length(description) <= 200);
