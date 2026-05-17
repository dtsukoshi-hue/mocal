-- store_hours の RLS 修正
-- service_role は Supabase で自動的に RLS をバイパスするため、
-- 不要な store_hours_all_service ポリシーを削除する
DROP POLICY IF EXISTS "store_hours_all_service" ON store_hours;

-- 念のため: anon / authenticated ユーザーによる直接書き込みを明示的に拒否
-- （RLS のデフォルトはポリシーがない操作を拒否するため、これは冗長だが明示的に記述）
-- SELECT のみ公開（既存の store_hours_select_public が対応済み）
