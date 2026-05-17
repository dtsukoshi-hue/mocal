-- 店舗の曜日別営業時間テーブル
-- day_of_week: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土（JS の getDay() に合わせる）
CREATE TABLE IF NOT EXISTS store_hours (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time     time NOT NULL DEFAULT '10:00',
  close_time    time NOT NULL DEFAULT '20:00',
  is_closed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, day_of_week)
);

-- RLS
ALTER TABLE store_hours ENABLE ROW LEVEL SECURITY;

-- 公開: 誰でも閲覧可（顧客が営業時間を確認できるようにする）
CREATE POLICY "store_hours_select_public"
  ON store_hours FOR SELECT USING (true);

-- 更新: service_role のみ（管理 API 経由）
CREATE POLICY "store_hours_all_service"
  ON store_hours FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- インデックス
CREATE INDEX IF NOT EXISTS idx_store_hours_store_id ON store_hours(store_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_store_hours_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_store_hours_updated_at
  BEFORE UPDATE ON store_hours
  FOR EACH ROW EXECUTE FUNCTION update_store_hours_updated_at();
