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
| 10 | 2026-05-19 `git reset --hard origin/main` で 175 commit ぶんの機能（コンボ / 顧客キャンセル / FAQ / お問い合わせ / pickup type デザイン等）を消失。4 日後（2026-05-23）の指摘まで気付かず | reset 前に feature-level audit を行わず、「deploy 済み = feature-complete」と暗黙仮定。`docs/recovery-plan.md` §4 で詳細記録、§6.1 で再発防止ルール |

## ルール（厳守）

### destructive な git / DB 操作の前

`git reset --hard` / `git push --force` / branch 削除 / production DB への直接 write 等の前には、必ず `docs/recovery-plan.md` §6.1 を参照。feature-level audit + ユーザー承認が必須。「deploy 済み = feature-complete」「revert したから OK」等の暗黙仮定は禁止。

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

# 3) spec を読む
#    - このファイル AGENTS.md（運用ルール）
#    - docs/workflow.md（アーキテクチャ全体図）
#    - docs/backlog.md（残作業・進捗管理）
#    CLAUDE.md は `@AGENTS.md` への参照のみ。
```

### バックログ更新ルール（厳守）

`docs/backlog.md` が残作業の単一の真実。**会話やメモで残作業を管理しない**（ドリフト・取りこぼし防止）。

- 着手するときに `[ ]` → `[~]` に変更し commit/push（並行作業の見える化）
- 完了したら実装と同じ commit で `[~]` → `[x]` に変更
- 新規発見の作業は**着手前**に `docs/backlog.md` へ追加してから実装
- 廃案は `[-]` + 理由を1行付記（削除はしない、履歴保全）

### ブランチ運用

- **基本は `main` で直接作業する。** Claude Code の worktree モードは原則使わない。
- やむを得ず worktree を切る場合は **必ず `git worktree add -b feature/<name> .worktrees/<name> main`** で main から派生させる。
- 並走させない。worktree を切ったら **24h 以内**に main にマージ or 廃棄。
- main への push は **GitHub Branch Protection で PR 必須・force-push 禁止** に設定されている前提。

### DB スキーマ

- 実 DB（production Supabase）が **唯一の真実**。
- supabase CLI は **dev dependency** として `package.json` に pin（`npx supabase ...` で呼ぶ）。グローバルインストールはしない。
- 変更手順:
  1. `npx supabase link --project-ref <PROJECT_REF>`（初回のみ）
  2. `npm run db:check`（変更前の現状確認）
  3. 本番 DB 変更後 → `npm run db:pull`（migration 生成）
  4. `npm run types:gen`（types.ts 自動生成）
  5. **手書きで `lib/database.types.ts` を編集しない**。アプリ側の helper エイリアスは `lib/database.aliases.ts` に書く

### 決済 / 法的整合性に関わる変更（2026-05-30 ルール化）

過去経緯: 2026-05-30 session で `lib/payment.ts` の `if (stripeConnectedAccountId)` 分岐 (initial commit から存在) を「動くから本番運用 OK」と短絡し、資金決済法 §37 違反相当の経路 (mocal が販売者として代金を預かる) を生み得る状態を作っていた。さらに、検証後に書いた決済フロー図も最初 4 件 + 2 件の誤りを含み、user に都度指摘されて修正した (`docs/payment-flow.md` 履歴参照)。

#### ルール（厳守）

**決済 / 法的当事者整理 / 資金移動経路に関わるコード変更は、実装の前に `docs/payment-flow.md` を更新する。**

具体的に対象となるもの:
- `lib/payment.ts` (createPayment / refundPayment / Stripe API 直接呼び出し全般)
- `app/api/webhook/stripe/route.ts` (event handler 追加・変更)
- `app/api/orders/[id]/route.ts` の PATCH / `app/api/orders/[id]/cancel/route.ts` の POST (status 遷移を伴う)
- `stores` テーブルの `stripe_account_id` 関連の制約・filter
- `/tokushoho` page の販売者表記
- 上記に関連する admin UI / 公開 UI / 設計ドキュメント

#### 手順

1. `docs/payment-flow.md` の A (Happy Path) / B (失敗 / 返金) / C (法的当事者 + 5 重防御) のうち、影響する図を**先に**更新
2. user に diff outline を提示して合意
3. 合意後にコード実装 → tests → PR
4. PR description に `docs/payment-flow.md` の対応箇所への参照を入れる

#### 検証の必須化

図を更新したら、**コードと突き合わせて 1 行ずつ verify** する。具体的には:
- WHERE 句 / SELECT field を実コードと突き合わせる
- 関数引数 / params を実コードと突き合わせる
- `cancelled_reason_type` 等の enum 値を実コードの分岐ごとに突き合わせる
- webhook が処理する event type を実コードの `case '...'` と突き合わせる

「描けたから正しい」は禁止 (recovery-plan §4.7 「過信バイアス」の再演を防ぐ)。

#### 法的領域での記述

- 法令文言は **e-Gov 等の引用元 URL** を併記、引用と解釈を区別
- Stripe Japan 等第三者の法的登録区分について **断定を書かない** (出典確認まで保留)
- 為替取引該当性 / 特商法上の販売者 等は「現状」「Phase 4c 後 (目標)」を**分けて記述**

#### Phase 4c PR-A への適用

#49 PR-A (`docs/payment-design-legal.md` §3 改訂) 着手時は本ルールを最初に確認、その上で着手すること。

---

### Supabase RLS の罠（必読・F-18 同類事故防止）

過去事故 F-18（`orders_public_select_by_uuid USING (true)` で全顧客データが anon 漏洩）の根本原因は **RLS セマンティクスの誤解**。**RLS ポリシーを書く・変更するときは必ず `docs/rls-review-checklist.md` を見ること**。

特に間違えやすいポイント:

1. **`CREATE POLICY ... FOR SELECT USING (true)` は「すべての行を anon に SELECT 許可」を意味する**  
   「クライアントが WHERE 句で id 指定するから安全」は**間違い**。`/rest/v1/<table>?select=*` で全件返却される。`USING (true)` を SELECT に書くのは**そのテーブルが 100% 公開で良い場合のみ**。

2. **`GRANT ALL ... TO anon` は禁止**  
   必要なものだけ列挙する（例: `GRANT INSERT ON ... TO anon`）。

3. **RLS の挙動は REST API と Realtime で異なる**  
   - REST: `current_setting('request.headers')` などで HTTP ヘッダー読める  
   - Realtime: **JWT claim のみ**参照。HTTP ヘッダーは見えない  
   → bearer-token モデルを RLS だけで実装する場合は **JWT claim** ベースが必須。

4. **新規 / 変更ポリシーは必ず `tests/security/anon-rest-access.test.ts` にケース追加**  
   anon 視点で「拒否されるべき SELECT」「許可されるべき SELECT」を verify。  
   `npm run test:security` で実行。修正前は FAIL、修正後に PASS する形で書く。

5. **migration を repo に含めない期間を作らない**  
   `.archive/` 退避は最終手段。RLS は repo 上でレビュー可能でなければならない。

### Push 前のチェック（自動化済み）

`.husky/pre-push` で以下を自動実行:
- DETACHED HEAD 拒否
- main 以外への direct push は警告（PR 必須）
- `.next/types/` が無ければ `npx next build` で typegen (Next.js 16 で `--no-lint` 廃止)
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
