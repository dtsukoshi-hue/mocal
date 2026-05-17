-- menu_items: 商品説明文を追加
ALTER TABLE menu_items ADD COLUMN description text;

-- orders: 顧客メモを追加（アレルギー情報・要望など）
ALTER TABLE orders ADD COLUMN customer_note text;
