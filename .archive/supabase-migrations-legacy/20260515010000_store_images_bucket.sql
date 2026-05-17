-- 店舗画像用 Supabase Storage バケット
-- 注: バケット自体は Supabase ダッシュボードまたは Management API で作成が必要。
--     この migration は RLS ポリシーのみ管理する。

-- store_images バケットが存在することを前提とした RLS ポリシー
-- バケット作成コマンド（Supabase CLI または ダッシュボードで実行）:
--   supabase storage bucket create store-images --public

-- ストレージは RLS が storage.objects テーブルに適用される
-- service_role はバイパスするため、ここでは公開 SELECT のみ許可
CREATE POLICY "store_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-images');

-- 認証済みアップロードは API ルート（service_role）を経由するため
-- anon / authenticated からの直接書き込みは不要
