-- ============================================================
-- 曜日別営業時間（プロトタイプ「定期営業時間」相当）
-- ============================================================
create table if not exists store_hours (
  id            uuid        primary key default gen_random_uuid(),
  store_id      uuid        not null references stores(id) on delete cascade,
  weekday       int         not null check (weekday between 0 and 6), -- 0=日, 1=月, ..., 6=土
  is_open       boolean     not null default true,
  open_time     time,                                                  -- 開店時間
  close_time    time,                                                  -- 閉店時間
  last_order    time,                                                  -- ラストオーダー（任意）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, weekday)
);

create index if not exists idx_store_hours_store_id on store_hours (store_id);

alter table store_hours enable row level security;

-- 公開読み取り（メニューや営業状態と同様、エンドユーザーが閲覧できる）
create policy "store_hours_public_read" on store_hours
  for select using (true);

-- 書き込みは service_role のみ（管理 API 経由）
-- 既定で RLS は他ロールを拒否するため明示的なポリシーは作らない

-- ============================================================
-- 既存パイロット店舗にデフォルト営業時間（11:00–22:00、水曜定休）を投入
-- 既存があればスキップ（idempotent）
-- ============================================================
do $$
declare
  v_store_id uuid := 'ce7ad472-381b-4a7b-8ca6-3e0a46ee5656';
begin
  if not exists (select 1 from store_hours where store_id = v_store_id) then
    insert into store_hours (store_id, weekday, is_open, open_time, close_time, last_order) values
      (v_store_id, 0, true,  '11:00', '22:00', '21:30'),  -- 日
      (v_store_id, 1, true,  '11:00', '22:00', '21:30'),  -- 月
      (v_store_id, 2, true,  '11:00', '22:00', '21:30'),  -- 火
      (v_store_id, 3, false, null,    null,    null),     -- 水（定休）
      (v_store_id, 4, true,  '11:00', '22:00', '21:30'),  -- 木
      (v_store_id, 5, true,  '11:00', '22:00', '21:30'),  -- 金
      (v_store_id, 6, true,  '11:00', '22:00', '21:30');  -- 土
  end if;
end $$;
