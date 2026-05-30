-- 店舗ごとの外部 URL (特商法 / アレルゲン情報) を追加
--
-- 背景:
--   mocal は Connect Standard で各店舗が販売者として動く marketplace モデル。
--   各店舗の特商法表示・アレルゲン情報は店舗自身が自社サイトで担保する設計。
--   mocal は店舗ページから当該 URL へリンクするだけで、自前 page を持たない。
--
--   詳細: docs/payment-design-legal.md §3 (取次事業者モデル)
--
-- いずれも任意項目 (NULL 許容)。
-- URL 形式の妥当性検証はアプリ層 (app/api/admin/store/route.ts) で実施。

ALTER TABLE "public"."stores"
  ADD COLUMN IF NOT EXISTS "tokushoho_url" text,
  ADD COLUMN IF NOT EXISTS "allergen_url"  text;

COMMENT ON COLUMN "public"."stores"."tokushoho_url"
  IS '店舗の特定商取引法表示 URL (各店舗の自社サイト)。NULL 許容、UI 上は任意入力';
COMMENT ON COLUMN "public"."stores"."allergen_url"
  IS '店舗のアレルゲン情報 URL (各店舗の自社サイト)。NULL 許容、UI 上は任意入力';
