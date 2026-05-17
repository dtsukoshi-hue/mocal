-- メールアドレスから auth.users.id を安全に検索する関数
-- service_role から呼び出す想定。SECURITY DEFINER で auth スキーマにアクセス
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM auth.users
  WHERE email = lower(trim(p_email))
  LIMIT 1;
  RETURN v_id;
END;
$$;

-- 実行権限: service_role のみ（anon/authenticated からは実行不可）
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
