# Migrations

このディレクトリは **空** です。

## 理由

worktree 内に存在していた旧 migration（20260423〜20260515）は実 DB（production）の運用スキーマと完全に乖離していたため、`.archive/supabase-migrations-legacy/` に退避しました。

## 真の DB スキーマを取得する手順

```bash
# Supabase CLI をインストール（未導入の場合）
npm install -g supabase

# プロジェクトをリンク（PROJECT_REF は .env.local の NEXT_PUBLIC_SUPABASE_URL から抜き出す）
supabase link --project-ref <PROJECT_REF>

# 実 DB のスキーマを migration として吐く
supabase db pull

# TypeScript 型も自動生成（lib/database.types.ts を上書き）
supabase gen types typescript --linked > lib/database.types.ts
```

## 二度と乖離させないルール

- DB スキーマを変更したら **必ず** `supabase db push` で migration を当てる
- 手動で SQL を本番 DB に流したら、**直後に** `supabase db pull` でローカルを揃える
- `lib/database.types.ts` は **手書きしない**。常に `supabase gen types` で自動生成
