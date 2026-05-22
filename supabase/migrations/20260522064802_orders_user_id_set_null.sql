-- ============================================================
-- #34 anonymous user cleanup cron の前提整備
--
-- orders.user_id の FK 制約を ON DELETE SET NULL に変更する。
-- これにより、anonymous user (auth.users) が削除されたとき、
-- 紐づく注文 (orders) は履歴として保持し、user_id だけ NULL になる。
--
-- 元の挙動 (default RESTRICT):
--   auth.users 削除 → CASCADE で profiles 削除 → orders.user_id が
--   profiles 参照を保つので削除 RESTRICT で fail
--
-- 変更後の挙動 (ON DELETE SET NULL):
--   auth.users 削除 → CASCADE で profiles 削除 → orders.user_id が
--   NULL になり、注文行自体は保持される
--
-- 設計詳細: docs/customer-auth-design.md / docs/backlog.md #34
-- ============================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";

ALTER TABLE public.orders
  ADD CONSTRAINT "orders_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."profiles"("id")
  ON DELETE SET NULL;
