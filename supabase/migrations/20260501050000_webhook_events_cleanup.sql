-- ============================================================
-- processed_webhook_events の自動クリーンアップ
-- Stripe は同一イベントの再送を最大 3 日間行う仕様のため、
-- 30 日以上経過したレコードは安全に削除できる。
-- ============================================================

create or replace function cleanup_old_webhook_events()
returns void
language sql
as $$
  delete from processed_webhook_events
  where processed_at < now() - interval '30 days';
$$;

-- 毎日 02:00 JST (= 17:00 UTC) に実行
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-webhook-events') then
    perform cron.unschedule('cleanup-webhook-events');
  end if;

  perform cron.schedule(
    'cleanup-webhook-events',
    '0 17 * * *',
    $cron$select cleanup_old_webhook_events();$cron$
  );
end $$;
