-- ============================================================
-- orders テーブルに顧客備考カラムを追加
-- アレルギー、辛さ、その他要望などを 200 文字以内で記録
-- ============================================================
alter table orders
  add column if not exists customer_note text check (char_length(customer_note) <= 200);
