-- 店舗ページ用 URL スラッグ
-- 例: /3000days-burger
ALTER TABLE stores ADD COLUMN slug text UNIQUE;

-- 英数字・ハイフンのみ許可（3〜50文字）
ALTER TABLE stores ADD CONSTRAINT stores_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]$');

-- 既存レコードにはひとまず NULL を許容（登録フローで設定必須）

CREATE INDEX idx_stores_slug ON stores(slug);
