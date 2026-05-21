-- ============================================================
-- F-18 修正: orders / order_items の anon SELECT 漏洩を解消
--
-- 背景: docs/security-review-2026-05-21.md F-18 / backlog #25
-- 設計: docs/customer-auth-design.md (P3 Anonymous Sign-Ins)
--
-- 顧客は Cart 提出時に supabase.auth.signInAnonymously() で anonymous user に。
-- INSERT 時 user_id = auth.uid() で紐付くため、既存の
-- orders_user_own_select / order_items_user_own_select (auth.uid() = user_id)
-- がそのまま顧客の Realtime / REST 読み取りをカバーする。
--
-- 検証: tests/security/anon-rest-access.test.ts (RUN_SECURITY_TESTS=1 で実行)
-- ============================================================

-- ------------------------------------------------------------
-- 1) 漏洩 policy を DROP
-- ------------------------------------------------------------

-- orders: anon が全件 SELECT 可能だった原因
DROP POLICY IF EXISTS "orders_public_select_by_uuid" ON public.orders;

-- orders: guest 注文（user_id IS NULL）を anon が SELECT 可能だった原因
DROP POLICY IF EXISTS "orders_guest_select_by_id" ON public.orders;

-- order_items: guest 注文の order_items を anon が SELECT 可能だった原因
DROP POLICY IF EXISTS "order_items_guest_select" ON public.order_items;

-- order_items: anon が WITH CHECK (true) で任意 INSERT 可能だった原因
-- 新フローでは createOrderAction が service_role 経由で INSERT するため不要
DROP POLICY IF EXISTS "order_items_guest_insert" ON public.order_items;

-- processed_webhook_events: anon が SELECT 可能だった
-- Stripe event id は推測困難だが、漏洩面を減らすため REVOKE
DROP POLICY IF EXISTS "webhook_events_select" ON public.processed_webhook_events;


-- ------------------------------------------------------------
-- 2) anon role への過剰な GRANT を REVOKE
-- ------------------------------------------------------------

REVOKE SELECT, UPDATE, DELETE ON public.orders      FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.order_items FROM anon;
REVOKE ALL                     ON public.processed_webhook_events FROM anon;

-- 注: orders_guest_insert は維持（status='pending' AND user_id IS NULL の制限あり）
-- 新フローでは service_role 経由なので未使用だが、防御層として残す。
-- anon に INSERT を直接打たれても guest_insert の制限 + user_id NULL での
-- INSERT は今後ほぼ起きない（顧客は anonymous sign-in 経由 = user_id NOT NULL）


-- ------------------------------------------------------------
-- 3) 確認用コメント
-- ------------------------------------------------------------

-- 期待される READ access のマトリクス:
--
--   table              | anon (no sign-in)        | authenticated (anon sign-in) | service_role
--  --------------------|--------------------------|------------------------------|--------------
--   orders             | x (REVOKE + no policy)   | own only (user_own_select)   | all
--   order_items        | x                        | own only (parent JOIN)       | all
--   processed_webhook  | x                        | x (no policy)                | all
--   stores             | o (public_read USING t)  | o                            | all
--   menu_items         | o                        | o                            | all
--   store_hours        | o                        | o                            | all
--   combo_offers       | o                        | o                            | all
--   profiles           | x                        | own only                     | all
--   store_members      | x                        | own only                     | all
--   push_subscriptions | x                        | store member only            | all
