-- ============================================================
-- menu_items に画像 URL カラムを追加
-- 画像本体は Supabase Storage (menu-images バケット) に保存
-- ここには公開 URL を保存する
-- ============================================================
alter table menu_items
  add column if not exists image_url text;

-- ============================================================
-- menu-images バケットを作成（手動セットアップが必要な場合あり）
-- 注: storage.buckets への INSERT は service_role のみ
-- ============================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- 公開バケットなので誰でも読めるが、書き込みは service_role のみ
-- （アプリ側 API で認証チェック → service_role でアップロード）
