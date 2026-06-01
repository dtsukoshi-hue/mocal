-- stores テーブル: is_open=true の店舗は必ず stripe_account_id を持つ (5 重防御 L1)
--
-- 背景:
--   docs/payment-design-legal.md §4 (5 重防御 L1 / Phase 4b #50)。
--   L2-L6 (公開フィルタ / 決済関数 throw / admin ガード / onboarding UI / action 層)
--   は既に Phase 4a (PR #35) で実装済だが、L1 (DB 制約) のみ未実装で残っていた。
--
--   この CHECK 制約により、(NULL stripe_account_id) ∧ (is_open=true) の組み合わせ
--   が DB レベルで弾かれ、取次事業者モデルから逸脱する経路が構造的に成立しない。
--
-- 適用前提:
--   - 既存の (stripe_account_id IS NULL AND is_open=true) の行が 0 件であること
--     (現在 1 row: 「3000DAYS BURGER 清澄白河本店」が該当。is_open=false に
--      するか、Connect onboarding を完了して stripe_account_id を SET してから
--      本 migration を apply すること。backlog #50 / docs/payment-flow.md 図 C)
--
-- 適用方法:
--   1. user が Supabase Dashboard SQL Editor 等で 既存 1 row を是正:
--        UPDATE stores SET is_open = false WHERE stripe_account_id IS NULL;
--   2. または admin から Stripe Connect onboarding を完了させる
--   3. その後本 migration を適用 (npx supabase db push)

ALTER TABLE "public"."stores"
  ADD CONSTRAINT "stores_open_requires_stripe_account"
  CHECK (NOT is_open OR stripe_account_id IS NOT NULL);

COMMENT ON CONSTRAINT "stores_open_requires_stripe_account" ON "public"."stores"
  IS 'docs/payment-design-legal.md §4 L1: is_open=true なら stripe_account_id 必須 (取次事業者モデル / 資金決済法 §37 違反経路の構造的閉塞)';
