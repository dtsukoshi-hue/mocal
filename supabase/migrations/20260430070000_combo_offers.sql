-- ============================================================
-- コンボ商品（お得なセット）
-- 既存メニュー商品の組み合わせを「セット」として提示する。
-- 注文時には個別の order_items として展開される（合計金額は price_delta を加算）。
-- ============================================================
create table if not exists combo_offers (
  id            uuid        primary key default gen_random_uuid(),
  store_id      uuid        not null references stores(id) on delete cascade,
  name          text        not null,
  description   text,
  /** セット価格 = 含まれるアイテムの合計 + price_delta（負も可） */
  price_delta   int         not null default 0,
  emoji         text,
  is_available  boolean     not null default true,
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists combo_offer_items (
  id            uuid        primary key default gen_random_uuid(),
  combo_id      uuid        not null references combo_offers(id) on delete cascade,
  menu_item_id  uuid        not null references menu_items(id),
  qty           int         not null default 1 check (qty >= 1),
  unique (combo_id, menu_item_id)
);

create index if not exists idx_combo_offers_store_id on combo_offers (store_id);
create index if not exists idx_combo_offer_items_combo_id on combo_offer_items (combo_id);

alter table combo_offers      enable row level security;
alter table combo_offer_items enable row level security;

-- 公開読み取り
create policy "combo_offers_public_read" on combo_offers
  for select using (true);

create policy "combo_offer_items_public_read" on combo_offer_items
  for select using (true);

-- 書き込みは service_role のみ
