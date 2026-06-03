-- #62 PR-2: Onboarding email confirmation 再設計の土台
--
-- 1. pending_signups テーブル: 確認メール送信後〜store 作成完了までの中間状態を保存
-- 2. create_store_with_owner RPC: stores INSERT + store_members INSERT を 1 トランザクションで実行
--
-- 設計詳細: docs/onboarding-auth-redesign.md PR-2

-- ============================================================================
-- 1. pending_signups
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  error_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id)
);

COMMENT ON TABLE public.pending_signups IS
  'Onboarding 確認メール送信後〜店舗作成完了までの中間状態。user_id 単一行 (UPSERT)。';
COMMENT ON COLUMN public.pending_signups.status IS
  'pending = 確認メール未消化 / completed = create_store_with_owner 成功 / failed = エラー停滞 (resume 可)';
COMMENT ON COLUMN public.pending_signups.error_count IS
  'create_store_with_owner 失敗回数 (slug_taken 等)。閾値で abuse 判定。';
COMMENT ON COLUMN public.pending_signups.expires_at IS
  '24h 経過で expired 扱い。cleanup cron で status="failed" に遷移 (本 PR では cron 未実装、別 backlog)';

-- RLS: service role only
-- (anon / authenticated に GRANT しない = SELECT/INSERT 全部不可。
--  service client 経由でしかアクセスできない)
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pending_signups FROM PUBLIC;
REVOKE ALL ON public.pending_signups FROM anon;
REVOKE ALL ON public.pending_signups FROM authenticated;

-- ============================================================================
-- 2. create_store_with_owner RPC
-- ============================================================================
-- stores と store_members を 1 トランザクションで insert する関数。
-- slug 重複 (race condition) は SQLSTATE 23505 を 'slug_taken' として raise。
--
-- SECURITY INVOKER: 呼び出し元の権限で実行 (service_role が呼ぶ前提)。
-- DEFINER にすると RLS bypass + GRANT 不備時の攻撃面が広がるため避ける。

CREATE OR REPLACE FUNCTION public.create_store_with_owner(
  p_name text,
  p_slug text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_store_id uuid;
  v_normalized_slug text;
BEGIN
  -- slug 正規化 (lower + trim)。client / action 側でも実施するが defense in depth。
  v_normalized_slug := lower(trim(p_slug));

  IF length(v_normalized_slug) = 0 THEN
    RAISE EXCEPTION 'slug_empty' USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  INSERT INTO public.stores (name, slug)
  VALUES (trim(p_name), v_normalized_slug)
  RETURNING id INTO v_store_id;

  INSERT INTO public.store_members (store_id, user_id, role)
  VALUES (v_store_id, p_user_id, 'owner');

  RETURN v_store_id;
EXCEPTION
  WHEN unique_violation THEN
    -- stores.slug UNIQUE もしくは store_members(store_id,user_id) UNIQUE 違反
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
END;
$$;

COMMENT ON FUNCTION public.create_store_with_owner IS
  '#62 PR-2: stores INSERT + store_members INSERT を atomic に実行。slug race 時は ''slug_taken'' を raise。';

REVOKE ALL ON FUNCTION public.create_store_with_owner FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_store_with_owner FROM anon;
REVOKE ALL ON FUNCTION public.create_store_with_owner FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_owner TO service_role;
