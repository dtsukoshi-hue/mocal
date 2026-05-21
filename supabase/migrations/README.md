# Migrations

このディレクトリには、`supabase db pull` で本番 DB から取得した migration が入る。

## 現在のファイル

- `20260521013317_remote_schema.sql` — 2026-05-21 取得時点の production schema スナップショット

## DB スキーマ変更の手順

```bash
# 初回のみ: プロジェクトをリンク
npx supabase link --project-ref <PROJECT_REF>
# PROJECT_REF は .env.local の NEXT_PUBLIC_SUPABASE_URL から抜き出す

# 変更前の現状確認
npm run db:check

# 本番 DB を変更後、差分を migration として吐く
npm run db:pull

# TypeScript 型も自動生成
npm run types:gen
```

## 厳守ルール

- DB スキーマを変更したら **必ず** `npm run db:pull` で migration を repo に取り込む
- `lib/database.types.ts` は **手書きしない**。常に `npm run types:gen` で自動生成
- アプリ側の helper エイリアス（`Store`, `Order` 等）は `lib/database.aliases.ts` に書く
- RLS ポリシー追加・変更時は `docs/rls-review-checklist.md` を**必ず**確認
- 新規 / 変更ポリシーには `tests/security/anon-rest-access.test.ts` にケース追加

## アーカイブ済み旧 migrations

`.archive/supabase-migrations-legacy/` に 2026-04 〜 2026-05 の旧 migration（14 ファイル）が退避されている。
理由: 当時の worktree 開発で実 DB と乖離 → 適用不能になったため。

**学習用に保持**しているもの:
- `20260509020000_rls_fixes.sql` — **F-18 (#25) を導入した RLS 設定の原典**。  
  `CREATE POLICY orders_public_select_by_uuid FOR SELECT USING (true)` の  
  コメントから「UUID は 128bit ランダムだから USING(true) で安全」という  
  誤った推論を導入したことが分かる。同類事故防止の教材として残す。  
  → 詳細は `docs/security-review-2026-05-21.md` F-18 / `docs/rls-review-checklist.md` 参照。
- `20260515000000_store_hours.sql` — `day_of_week` カラム名（過去事故 #4 の原因）。  
  現在は `weekday` に修正済み。

これらの archive は **適用しない**（migration runner からは見えない位置にある）。
新規 schema 変更は必ず `supabase/migrations/` 配下に置く。
