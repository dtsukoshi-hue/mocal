-- ============================================================
-- push_subscriptions テーブル
-- ============================================================
create table if not exists push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  store_id   uuid        not null references stores(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

-- service_role のみ読み書き可（管理サーバーから操作）
create policy "service_role_only" on push_subscriptions
  using (true);

-- ============================================================
-- pg_cron 拡張
-- ============================================================
create extension if not exists pg_cron;

-- ============================================================
-- no_show 自動遷移（5分ごと）
-- ready かつ ready_at から 15分経過した注文を no_show に
-- ============================================================
select cron.schedule(
  'no-show-transition',
  '*/5 * * * *',
  $$
    update orders
    set status = 'no_show',
        no_show_at = now()
    where status = 'ready'
      and ready_at < now() - interval '15 minutes'
      and no_show_at is null;
  $$
);

-- ============================================================
-- 未払い注文のタイムアウトキャンセル（5分ごと）
-- pending かつ作成から 10分経過した注文を cancelled に
-- ============================================================
select cron.schedule(
  'cancel-stale-pending',
  '*/5 * * * *',
  $$
    update orders
    set status = 'cancelled',
        cancelled_reason_type = 'timeout'
    where status = 'pending'
      and created_at < now() - interval '10 minutes'
      and stripe_payment_intent_id is not null;
  $$
);
