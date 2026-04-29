-- ============================================================
-- staff_accounts: 店舗スタッフのログインアカウント
-- 既存の env ベース owner（ADMIN_EMAIL）はそのまま維持し、
-- 追加のスタッフだけをこのテーブルで管理する。
-- ============================================================

create table if not exists staff_accounts (
  id            uuid        primary key default gen_random_uuid(),
  store_id      uuid        not null references stores(id) on delete cascade,
  email         text        not null,
  password_hash text        not null,
  role          text        not null default 'staff'
                            check (role in ('owner', 'staff')),
  created_at    timestamptz not null default now(),
  -- 同一店舗で同じメール重複禁止（store_id をまたいで同じメールはOK）
  unique (store_id, email)
);

create index if not exists idx_staff_accounts_email on staff_accounts (email);

-- RLS は service_role 経由でしかアクセスしないので enable のみ
alter table staff_accounts enable row level security;
