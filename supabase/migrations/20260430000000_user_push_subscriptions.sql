-- ============================================================
-- order_push_subscriptions: 顧客の注文ステータス通知用 WebPush 購読
-- 注文 ID（UUID）を access token として、その注文に対する通知を購読する
-- ============================================================

create table if not exists order_push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  order_id   uuid        not null references orders(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now(),
  unique (order_id, endpoint)
);

create index if not exists idx_order_push_subs_order on order_push_subscriptions (order_id);

alter table order_push_subscriptions enable row level security;
