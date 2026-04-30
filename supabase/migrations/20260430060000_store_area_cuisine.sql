-- ============================================================
-- 店舗のエリア・ジャンル属性
-- ディスカバリーページの絞り込みに使用
-- ============================================================
alter table stores
  add column if not exists area text,
  add column if not exists cuisine_type text;

-- 検索用インデックス
create index if not exists idx_stores_area         on stores (area);
create index if not exists idx_stores_cuisine_type on stores (cuisine_type);

-- パイロット店舗にデフォルト値を投入
update stores
  set area = '清澄白河',
      cuisine_type = 'バーガー'
  where id = 'ce7ad472-381b-4a7b-8ca6-3e0a46ee5656'
    and (area is null or cuisine_type is null);
