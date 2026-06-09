-- ============================================================
-- 2026-06-08 セキュリティ監査 hardening
--
-- 監査で発見された 4 件の DB-side 漏えい / 過剰権限を一括修正。
-- 詳細: docs/security-audit-2026-06-08.md (PR 内 description 参照)
--
-- AGENTS.md「Supabase RLS の罠」§2: `GRANT ALL TO anon` 禁止。
-- 必要な権限のみ列挙する原則に従う。
-- ============================================================

-- ------------------------------------------------------------
-- (1) stores: anon は公開列のみ SELECT 可とする
--     stripe_account_id / manual_override_until が anon REST 経由で全店舗ぶん
--     抜けていた問題 (監査 2026-06-08 #2)。
--     RLS policy stores_public_read USING (true) は維持しつつ、列レベル GRANT
--     で公開列のみ許可。
-- ------------------------------------------------------------

REVOKE SELECT ON public.stores FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  area,
  cuisine_type,
  description,
  is_open,
  wait_minutes,
  logo_url,
  cover_url,
  tokushoho_url,
  allergen_url,
  created_at
) ON public.stores TO anon;

-- authenticated (anonymous sign-in 含む) は引き続き全列 SELECT 可
-- (顧客 page で stripe_account_id を直接参照する箇所は無いが、defense in depth
--  として無制限にはせず、後続 PR で同様の列レベル化を検討)


-- ------------------------------------------------------------
-- (2) get_user_id_by_email: email enumeration 防止
--     SECURITY DEFINER で auth.users を SELECT する関数。anon が呼ぶと
--     任意 email が mocal 登録済かを返してしまう (監査 2026-06-08 #3)。
--     app では members.ts (inviteStaffAction) が service_role 経由で呼ぶのみ。
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text)
  FROM anon, authenticated, public;
-- service_role は OWNER のため REVOKE しても呼べる


-- ------------------------------------------------------------
-- (3) RPC defense in depth: app コードから呼ばれない関数の anon/authenticated
--     GRANT を REVOKE する (監査 2026-06-08 #4)。
--     handle_new_user / rls_auto_enable は trigger 専用、外部 RPC として呼べない
--     (`trigger functions can only be called as triggers`) が defense in depth
--     として REVOKE する。
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.should_be_open(uuid)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.sync_store_open_status()
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM anon, authenticated, public;


-- ------------------------------------------------------------
-- (4) orders_set_payment_intent policy 削除
--     authenticated 全員が他人の pending order に payment_intent_id を書き込める
--     policy (監査 2026-06-08 #6)。現状 app は service_role 経由で書くため
--     policy 自体が dead code。攻撃面として残すべきではない。
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "orders_set_payment_intent" ON public.orders;


-- ------------------------------------------------------------
-- 期待される access matrix (本 migration 後):
--
--   table              | anon                          | authenticated         | service_role
--  --------------------|-------------------------------|-----------------------|--------------
--   stores (列)         | 公開列のみ (stripe_account_id  | 全列                  | 全列
--                      | / manual_override_until 不可)  |                       |
--   orders             | × (REVOKE)                    | own only              | 全
--   order_items        | ×                             | own only              | 全
--
--   function                       | anon | authenticated | service_role
--  -------------------------------|------|---------------|--------------
--   get_user_id_by_email          | ×    | ×             | ○ (members.ts)
--   should_be_open / sync_store_* | ×    | ×             | ○
--   handle_new_user / rls_auto    | n/a  | n/a           | n/a (trigger only)
-- ------------------------------------------------------------
