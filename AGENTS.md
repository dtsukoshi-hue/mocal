<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## mocal 固有の注意（マーカー外）

- middleware は `proxy.ts`（`middleware.ts` ではない）/ export 名は `default` ではなく `proxy`
- 詳細な実装ルールは `CLAUDE.md` の §1〜§13 を参照すること
- 型チェック：変更後は必ず `npx tsc --noEmit` を実行
- テスト：`npx vitest run`（350件・全パスが前提）
