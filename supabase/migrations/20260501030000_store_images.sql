-- ============================================================
-- 店舗ロゴ・カバー画像
-- ロゴ: 店舗一覧・ヘッダー用の小さなアイコン
-- カバー: 店舗ページ上部のヒーロー画像
-- ============================================================
alter table stores
  add column if not exists logo_url  text,
  add column if not exists cover_url text;

-- ============================================================
-- store-images バケット（公開・読み取りのみ）
-- 書き込みは管理 API 経由で service_role が行う
-- ============================================================
insert into storage.buckets (id, name, public)
values ('store-images', 'store-images', true)
on conflict (id) do nothing;
