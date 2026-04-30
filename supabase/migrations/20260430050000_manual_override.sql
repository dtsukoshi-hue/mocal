-- ============================================================
-- 受付トグルの手動オーバーライド
-- 管理者が手動で is_open を切り替えた場合、ここに有効期限を入れる。
-- cron は manual_override_until > now() の店舗をスキップし、
-- 期限切れの場合は null に戻して以降は再び自動制御に戻す。
-- ============================================================
alter table stores
  add column if not exists manual_override_until timestamptz;

-- sync_store_open_status を override 対応版に置き換え
create or replace function sync_store_open_status()
returns void
language plpgsql
as $$
declare
  r record;
  v_should boolean;
begin
  for r in select id, manual_override_until from stores loop
    -- 期限切れの override は null に戻す
    if r.manual_override_until is not null and r.manual_override_until <= now() then
      update stores
        set manual_override_until = null
        where id = r.id;
    -- 有効な override 中の店舗はスキップ（is_open は手動値を維持）
    elsif r.manual_override_until is not null and r.manual_override_until > now() then
      continue;
    end if;

    v_should := should_be_open(r.id);
    if v_should is null then
      continue; -- store_hours 未登録
    end if;
    update stores
      set is_open = v_should
      where id = r.id and is_open is distinct from v_should;
  end loop;
end;
$$;
