<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ⚠️ 過去事故の記録と再発防止ルール

このプロジェクトでは過去、Claude セッションが原因で「同じバグを 3 回直しても直らない」「main と worktree が別実装で並走する」等の事故が起きた。**作業を始める前に必ず以下を読むこと。**

## 過去に発生した事故と原因

| # | 事故 | 根本原因 |
|---|---|---|
| 1 | UI 崩れ修正の 3 回ループ（hydration / flex で button 潰れ / 受付状態の位置） | spec (`CLAUDE.md §12`) を読まず、本流との差分も取らず、個別バグだけ修正して「直った」と誤判定 |
| 2 | worktree が Initial commit から派生（main から派生していない） | Claude Code の worktree モードか過去セッションの誤操作 |
| 3 | worktree と main が 30+ コミットずつ並走 | 別 Claude セッションが互いを知らずに別ルートで実装 |
| 4 | `store_hours` 列名乖離（`day_of_week` vs `weekday`） | worktree migration が production DB に当たっていなかった |
| 5 | `lib/database.types.ts` が手書きで実 DB と乖離 | 自動生成手順なし |
| 6 | mocal-iota.vercel.app/admin/login がずっと壊れていた | main のコードが実 DB と整合せず deploy されたまま放置 |
| 7 | 「正常」と何度も誤判定 | spec と本流との比較を最初にやらなかった |
| 8 | 顧客 push / cron / webhook の動作未確認のまま deploy | E2E が回っておらず、エンドポイントを手動疎通もしていなかった |
| 9 | ローカル main を `git reset --hard <タグ>` で旧 main backup へ巻き戻し、origin/main を pull せず開発を 175 commit 継続。Initial commit でしか origin と繋がらない並走状態が 24h+（2026-05-18〜19） | reset 後と各セッション冒頭で `git fetch && git log HEAD..origin/main` を確認せず開発続行。origin/main にある再発防止策（.husky・scripts・AGENTS.md 拡張）が手元から消えたまま気付かなかった |

## ルール（厳守）

### 作業開始時に必ずやること

```bash
# 0) ローカルと origin/main の同期確認（最重要・最初に必ず）
git fetch origin
git log HEAD..origin/main --oneline   # 何か出たら origin が先行 → pull してから作業
git log origin/main..HEAD --oneline   # 何か出たら自分が先行 → push する commit がある

# 1) main から離れていないか確認（worktree / 別 branch 利用時）
git log main..HEAD --oneline
git diff main...HEAD --stat

# 2) DB と types の整合チェック
npm run db:check

# 3) spec を読む（このファイル AGENTS.md を最後まで。CLAUDE.md は `@AGENTS.md` への参照のみ）
```

### ブランチ運用

- **基本は `main` で直接作業する。** Claude Code の worktree モードは原則使わない。
- やむを得ず worktree を切る場合は **必ず `git worktree add -b feature/<name> .worktrees/<name> main`** で main から派生させる。
- 並走させない。worktree を切ったら **24h 以内**に main にマージ or 廃棄。
- main への push は **GitHub Branch Protection で PR 必須・force-push 禁止** に設定されている前提。

### DB スキーマ

- 実 DB（production Supabase）が **唯一の真実**。
- 変更手順:
  1. `npm i -g supabase`（未導入時）
  2. `supabase link --project-ref <PROJECT_REF>`
  3. `npm run db:check`（変更前の現状確認）
  4. 本番 DB 変更後 → `npm run db:pull`（migration 生成）
  5. `npm run types:gen`（types.ts 自動生成）
  6. **手書きで `lib/database.types.ts` を編集しない**

### Push 前のチェック（自動化済み）

`.husky/pre-push` で以下を自動実行:
- DETACHED HEAD 拒否
- main 以外への direct push は警告（PR 必須）
- `.next/types/` が無ければ `npx next build --no-lint` で typegen
- `npx tsc --noEmit` 必須
- `npx vitest run` 必須

### ローカル `.env.local` の復旧手順

`.env.local` が消失/破損したときの復旧。**Vercel の Sensitive 環境変数は `vercel env pull` では空文字で返ってくる**ため、Dashboard から手動コピーが必要。

```
1. Vercel Dashboard を開く: https://vercel.com/dtsukoshi-hues-projects/mocal/settings/environment-variables
2. .env.local.example を参照し、必要な変数を1つずつ「Show value」して値をコピー
3. .env.local に貼り付け（書式: KEY="value"。クォートあり推奨、Vercel CLI 形式と一致）
4. 最後に動作確認:
   npx tsc --noEmit   # 型エラーゼロ
   npx vitest run     # 全テストパス
   npm run db:check   # 本番 DB と types の整合
```

**注意**:
- `vercel env pull .env.local --environment=production` で取得可能なのは VERCEL_OIDC_TOKEN 等の非 Sensitive のみ。必須14変数は値が空文字で来る。
- Sensitive 解除すれば pull できるが Dashboard 上で平文表示になり、漏洩リスク増。原則「美しい状態」かつセキュア。Sensitive 維持・手動コピー運用とする。
- `.env.local` は `.gitignore` 済み。コミット禁止。

### CI（自動化済み）

`.github/workflows/ci.yml` で main への push / PR ごとに:
- typecheck
- lint
- 180+ tests
- production build

すべて通過しないと merge できない（GitHub Branch Protection と組み合わせて）。

### 「UI が前と違う／古い」とユーザーが言ったとき

絶対にやってはいけないこと:
- 推測で個別バグ修正を始める
- 「直りました」と即時報告

必ずやること:
1. `git log` と過去セッションの jsonl (`~/.claude/projects/-Users-daisuke-mocal*/`) を遡る
2. `CLAUDE.md §12 UI の制約` を読む
3. main 側にあって worktree に無い機能を `git diff main...HEAD --stat` で確認
4. spec/本流とコードを比較したうえで「何が古いか」を特定してから手を動かす
