-- ============================================================
-- 営業時間に基づく受付の自動 ON/OFF
-- store_hours の曜日別営業時間に従い、stores.is_open を毎分チェックして更新する
-- ============================================================

-- 1) ヘルパー関数: 現在 (Asia/Tokyo) の曜日と時刻で店舗の営業中状態を返す
create or replace function should_be_open(p_store_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_now_jst   timestamp;
  v_weekday   int;
  v_now_time  time;
  v_row       store_hours%rowtype;
begin
  -- JST 現在
  v_now_jst  := (now() at time zone 'Asia/Tokyo');
  v_weekday  := extract(dow from v_now_jst)::int; -- 0=日, 1=月, ..., 6=土
  v_now_time := v_now_jst::time;

  select * into v_row
    from store_hours
    where store_id = p_store_id and weekday = v_weekday;

  if not found then
    -- 営業時間が登録されていない店舗は手動運用とみなして変更しない
    return null;
  end if;

  if not v_row.is_open then
    return false;
  end if;

  if v_row.open_time is null or v_row.close_time is null then
    return false;
  end if;

  -- last_order がある場合は last_order を上限に、無ければ close_time を上限に
  return v_now_time >= v_row.open_time
     and v_now_time < coalesce(v_row.last_order, v_row.close_time);
end;
$$;

-- 2) 全店舗を巡回して is_open を同期する関数
create or replace function sync_store_open_status()
returns void
language plpgsql
as $$
declare
  r record;
  v_should boolean;
begin
  for r in select id from stores loop
    v_should := should_be_open(r.id);
    if v_should is null then
      continue; -- store_hours 未登録 → 手動運用
    end if;
    update stores set is_open = v_should where id = r.id and is_open is distinct from v_should;
  end loop;
end;
$$;

-- 3) pg_cron で毎分実行（pg_cron 拡張は push_subscriptions マイグレーションで導入済み）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-store-open-status') then
    perform cron.unschedule('sync-store-open-status');
  end if;

  perform cron.schedule(
    'sync-store-open-status',
    '* * * * *',  -- 毎分
    $cron$select sync_store_open_status();$cron$
  );
end $$;
