-- ============================================================
-- 3000DAYS BURGER（清澄白河本店）プロトタイプメニューのシード
-- 既存メニューがあればスキップ（idempotent）
-- store_id は env の ADMIN_STORE_ID と一致する想定
-- 別店舗で実行する場合は :store_id を上書きしてください
-- ============================================================

-- パイロット店舗のID（運用時の値）
do $$
declare
  v_store_id uuid := 'ce7ad472-381b-4a7b-8ca6-3e0a46ee5656';
begin
  -- 既にメニューがあれば何もしない
  if exists (select 1 from menu_items where store_id = v_store_id) then
    return;
  end if;

  -- 店舗名・wait_minutes をプロトタイプに合わせる（任意）
  update stores
    set name = '3000DAYS BURGER 清澄白河本店',
        wait_minutes = 15
    where id = v_store_id;

  -- バーガー
  insert into menu_items (store_id, name, price, description, category, emoji, is_available, sort_order) values
    (v_store_id, '極上肉づくしバーガー',     1480, '3000日かけて完成した名物パティ',          'バーガー', '🍔', true, 10),
    (v_store_id, 'アボカドチーズバーガー',   1380, 'クリーミーアボカド×チーズ',               'バーガー', '🥑', true, 20),
    (v_store_id, 'クラシックチーズバーガー', 1180, '定番の王道スタイル',                       'バーガー', '🍔', true, 30),
    (v_store_id, 'ベーコンチーズバーガー',   1280, 'スモーキーベーコン×チーズ',               'バーガー', '🥓', true, 40),
    (v_store_id, 'ハラペーニョチリバーガー', 1380, '辛党必見',                                 'バーガー', '🌶', true, 50);

  -- タコライス
  insert into menu_items (store_id, name, price, description, category, emoji, is_available, sort_order) values
    (v_store_id, '炙りチーズタコライス',     1280, 'とろけるチーズを炙って仕上げ',             'タコライス', '🌮', true, 110),
    (v_store_id, 'アボカドタコライス',       1180, 'なめらかアボカド',                         'タコライス', '🥑', true, 120),
    (v_store_id, 'エッグタコライス',         1080, '半熟卵をトッピング',                       'タコライス', '🍳', true, 130);

  -- サイド
  insert into menu_items (store_id, name, price, description, category, emoji, is_available, sort_order) values
    (v_store_id, 'マンチャーズポテトフライ', 480, 'プレーンソルト / 10種スパイス',             'サイド', '🍟', true, 210),
    (v_store_id, 'ビアバッターオニオンリング', 580, 'ビール衣でサクサク',                      'サイド', '🧅', true, 220),
    (v_store_id, 'チキンナゲット',           520, 'ジューシーな自家製ナゲット',                'サイド', '🍗', true, 230);

  -- ドリンク
  insert into menu_items (store_id, name, price, description, category, emoji, is_available, sort_order) values
    (v_store_id, 'コーラ',           320, '',                                                  'ドリンク', '🥤', true, 310),
    (v_store_id, 'ジンジャーエール', 320, '',                                                  'ドリンク', '🥤', true, 320),
    (v_store_id, 'アイスコーヒー',   380, '',                                                  'ドリンク', '☕', true, 330),
    (v_store_id, 'アイスティー',     380, '',                                                  'ドリンク', '🧊', true, 340);
end $$;
