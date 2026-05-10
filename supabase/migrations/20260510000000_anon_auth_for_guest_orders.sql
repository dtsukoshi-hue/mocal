-- ゲスト注文に Supabase 匿名認証を採用するための RLS 整理
--
-- 背景:
--   ゲスト注文（user_id = null）は Realtime でステータス変化を受信できなかった。
--   回避策として "orders_public_select_by_uuid" (USING true) が検討されたが、
--   これは anon キー（NEXT_PUBLIC_*）で全注文を取得できる重大なプライバシー侵害になる。
--
-- 正しい解決策:
--   フロントエンドで supabase.auth.signInAnonymously() を呼び、
--   orders.user_id に匿名ユーザーの auth.uid() をセットする。
--   これにより既存の orders_user_own_select ポリシー
--   (USING (auth.uid() = user_id)) が匿名ユーザーにも適用される。
--
-- このマイグレーションでは、既存ポリシーが正しく機能することを確認し、
-- 誤って追加された全件公開ポリシーが存在する場合は削除する。

-- 誤って追加された場合に備えて冪等的に削除
DROP POLICY IF EXISTS "orders_public_select_by_uuid" ON orders;

-- order_items も同様に確認（存在しないはずだが念のため）
DROP POLICY IF EXISTS "order_items_public_select_by_uuid" ON order_items;

-- 匿名ユーザーが自身の注文を INSERT できるポリシー
-- （実際の INSERT は service_role 経由だが、将来の RLS 強化に備えて追加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_anon_insert'
  ) THEN
    CREATE POLICY "orders_anon_insert" ON orders
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND auth.uid() = user_id
      );
  END IF;
END$$;
