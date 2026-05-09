-- 店舗説明文カラムを追加
ALTER TABLE stores ADD COLUMN IF NOT EXISTS description text;
