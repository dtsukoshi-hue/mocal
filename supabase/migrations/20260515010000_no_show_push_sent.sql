-- no_show へ遷移した注文にプッシュ通知が送信済みかを追跡するフラグ
-- pg_cron は DB 側でステータスを更新するが Push 通知を送れない。
-- Vercel cron (/api/cron/no-show) がこのフラグを見て未送信分を拾ってプッシュを送る。
alter table orders
  add column if not exists no_show_push_sent boolean not null default false;

-- pg_cron の no-show-transition ジョブを更新して no_show_push_sent = false を明示
select cron.unschedule('no-show-transition');

select cron.schedule(
  'no-show-transition',
  '*/5 * * * *',
  $$
    update orders
    set status            = 'no_show',
        no_show_at        = now(),
        no_show_push_sent = false
    where status = 'ready'
      and ready_at < now() - interval '15 minutes'
      and no_show_at is null;
  $$
);
