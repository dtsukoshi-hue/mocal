-- 店舗オーナー向け LP (/for-stores) からの問い合わせを保存するテーブル
-- recovery-plan §5.2 Phase R-4 (L9 / #40) で復元
create table if not exists store_inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  store_name  text not null,
  email       text not null,
  message     text,
  created_at  timestamptz not null default now()
);

-- RLS 有効化: ポリシーを定義しないことで anon / authenticated は
-- 一切アクセス不可。service_role のみ RLS をバイパスして読み書きできる。
-- (送信は server action 経由で service_role を使う、閲覧は admin 画面で service_role を使う)
alter table store_inquiries enable row level security;
