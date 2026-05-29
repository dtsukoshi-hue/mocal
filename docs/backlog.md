# mocal — プロダクトバックログ

> 残作業の単一の真実（single source of truth）。
> AI セッションが「次に何をやるか」を確認する起点。`AGENTS.md`「作業開始時にやること」から参照される。
>
> **更新ルール**（重要）:
> - 着手するときに `[ ]` → `[~]` に変更し、同じ commit で push（並行作業の見える化）
> - 完了したら実装と同じ commit で `[~]` → `[x]` に変更（ドリフト防止）
> - 新規発見の作業は**実装に着手する前**にこのファイルへ追加
> - 削除はせず、廃案にする場合は `[-]` + 理由を1行付記（履歴保全）

## 凡例

| 記号 | 意味 |
|---|---|
| 🔴 | 出荷ブロッカー |
| 🟠 | 直近の品質改善（パイロット運用中） |
| 🟡 | 中期の機能拡張（Phase 2） |
| 🟢 | 長期（Phase 3） |
| `[ ]` | 未着手 |
| `[~]` | 進行中 |
| `[x]` | 完了 |
| `[-]` | 廃案（理由を付記） |

---

## 直近完了マイルストーン（2026-05-19〜20）

- [x] ローカル ↔ origin 並走の解消（reset to origin/main + 175 commit を `local-main-2026-05-19` タグで保全）
- [x] enforcement レイヤー復元（`.husky/pre-push` / `scripts/check-db-schema.mjs` / `AGENTS.md` 拡張 / `.env.local.example`）
- [x] `.env.local` 14 変数の復旧（Vercel Sensitive 制約への対応・SESSION_SECRET と VAPID をローカル生成）
- [x] 過去事故 #9（ローカル↔origin 並走）の AGENTS.md 記録 + セッション開始時の同期チェック手順追加
- [x] `docs/workflow.md` 追加（アーキテクチャ全体図）
- [x] `docs/backlog.md` 追加（このファイル）

---

## 🔴 出荷ブロッカー

- [ ] **1. 法人設立後の `/tokushoho` 更新**  
  「販売業者: Entrust合同会社（設立準備中）」「メールアドレス: support@mocal.jp（準備中）」を実値に。15分
- [~] **2. cron 外部スケジューラを実稼働化**  
  Hobby plan 制約のため Vercel Cron は不可、cron-job.org で暫定運用。実証実験開始時に Pro 化して `vercel.json` の `crons` に移行する方針。設定手順は `docs/deploy-runbook.md` §9.1 に明文化済。ユーザーが cron-job.org に 3 ジョブ登録 (store-hours / no-show / cleanup-anon) すれば完了。
- [x] **3. `CRON_SECRET` を Vercel に登録** (2026-05-21 完了)  
  生成 → `.env.local` 追記 → Vercel (Prod/Preview/Dev) 登録 → Redeploy → 本番 curl で 401/200 を実証確認。F-03 解消。
- [~] **4. 新規店舗 onboarding の Stripe Connect 動作確認**  
  `STRIPE_CLIENT_ID` が Vercel env に無く `/api/onboarding/stripe/connect` が 500 になる。設定手順は `docs/deploy-runbook.md` §9.2 に明文化済。ユーザーが Stripe Dashboard → Connect で client_id 取得 + Vercel env 登録 + redirect URI 追加 + redeploy + .env.local 更新で完了。
- [x] **38. コンボ商品復元 (recovery Phase R-2 / L1)** (2026-05-23 完了)  
  R2-1 ([mocal#8](https://github.com/dtsukoshi-hue/mocal/pull/8)) で server action + tests、R2-2 ([mocal#9](https://github.com/dtsukoshi-hue/mocal/pull/9)) で cache + page.tsx、R2-3 統合 ([mocal#10](https://github.com/dtsukoshi-hue/mocal/pull/10)) で MenuView + Cart UI。実機 verify 済 (テスト combo `テストセット` で 2,360円 → qty 変更まで動作)
- [x] **39. pickup type ラベル + デザイン復元 (recovery Phase R-1 R1-2 / L2)** (2026-05-23 完了)  
  cart の pickup type を「スタンダード / 日時指定」+ subtitle + gray 系デザインに復元。[mocal#6](https://github.com/dtsukoshi-hue/mocal/pull/6)
- [x] **22. Next.js 16.2.4 → 16.2.6 セキュリティ更新（F-02）** (2026-05-21 完了)  
  next 16.2.6 + overrides で postcss ^8.5.15 / brace-expansion ^5.0.6。`npm audit` 3 → 0、180 tests pass、本番 smoke 全 200、CSP nonce / security headers / cron 認証も regression なし。
- [x] **23. Supabase migrations を repo に取り込む（F-01）** (2026-05-21 完了)  
  supabase CLI を dev dep として導入、`db pull` で `20260521013317_remote_schema.sql` 生成 (1208 行)。auto-gen `database.types.ts` の helper エイリアスを `database.aliases.ts` に分離、11 ファイルの import を切替、`store-cache.ts` で narrow cast 追加（DB の CHECK 制約と整合）。RLS レビューで重大 finding → 新規 #25 として追加。
- [x] **25. RLS の `orders` / `order_items` anon SELECT 漏洩（F-18 / 🔴 出荷ブロッカー）** (2026-05-21 完了)  
  `CREATE POLICY orders_public_select_by_uuid ON orders FOR SELECT USING (true)` + `GRANT ALL ... TO anon` により、anon キーで全 orders / order_items を SELECT 可能（UUID 列挙攻撃可能・PII 漏洩）。本番実証済み。  
  **採択方針**: A+ (注文ごと専用 JWT 発行 + RLS で `auth.jwt() ->> 'order_id'` 検証)。  
  Step 0 (#26〜#30 再発防止策) → Step 1 (#31 設計ドキュメント) → Step 2 (#32 実装) の順で進める。
- [x] **26. anon REST アクセスのセキュリティ regression test 追加（P1）** (2026-05-21 完了)  
  `tests/security/anon-rest-access.test.ts` (11 ケース) + `npm run test:security` script。`.env.local` を直接読んで `process.env` 汚染なし。F-18 修正完了 (2026-05-21) 時点で `RUN_SECURITY_TESTS=1` ガードを撤廃、`describe.skipIf(!isRealSupabase)` のみで実 Supabase に向いているときだけ走る形に。default `npm test` / pre-push でも常時実行 = 恒久 regression net。CI (dummy env) では graceful skip。
- [x] **27. RLS policy レビューチェックリスト作成（P2）** (2026-05-21 完了)  
  `docs/rls-review-checklist.md` 作成。大原則 5 つ、新規ポリシー追加時の A〜D チェックリスト、`USING (true)` を書く前の 4 条件、良い / 悪いパターン例、A+ 用 JWT claim パターンの先行記述。
- [x] **28. workflow.md / AGENTS.md の bearer-token 表現整備（P3+P4）** (2026-05-21 完了)  
  workflow.md §3 を「移行中：A+ 設計へ」に改訂、F-18 既知課題と修正方針を明記。AGENTS.md に「Supabase RLS の罠」セクション (5 項目) を追加、`docs/rls-review-checklist.md` への導線を整備。supabase CLI 説明も dev dep に更新。
- [x] **29. `supabase db lint` 等の自動 RLS 検査（P5 / 調査タスク）** (2026-05-21 完了)  
  `npx supabase db lint --linked` 実行可能、構文エラーは検出するが RLS のセマンティクス（`USING(true)` 等）は検出しない。F-18 同類は #26 の security regression test で検出するのが正解。pre-push 組み込みは見送り（ネットワーク依存・効用限定的）。将来 CI の補助 job として追加可。
- [x] **30. 旧 .archive 内 migrations の整合確認** (2026-05-21 完了)  
  `.archive/supabase-migrations-legacy/20260509020000_rls_fixes.sql` に F-18 を導入した RLS 設定の**原典コードと意図**を確認。コメント「UUID は 128bit ランダムで推測不可能なため、ID を知っていれば参照を許可」が RLS セマンティクス誤解の証拠。**学習用に保持**、supabase/migrations/README.md で archive の意義を明文化。
- [x] **31. 顧客認証 (#25) 設計ドキュメント作成（旧 A+ → P3 への再設計含む）** (2026-05-21 完了)  
  当初 A+ (自前 JWT signing) で `docs/customer-jwt-design.md` 作成 → 設計レビューで複数の妥協点発覚 → Supabase Dashboard 確認の結果、自前 JWT signing は新方式 (managed ES256) と整合しないことが判明 → **P3 (Anonymous Sign-Ins) に方針変更**。旧 doc は superseded として保持、新 `docs/customer-auth-design.md` を作成。
- [x] **32. 顧客認証 (P3 Anonymous Sign-Ins) 実装（#25 修正本体）** (2026-05-21 完了)  
  ↓ 実装直後の振り返りで「とりあえず」が複数混入していたため #37 で refactor。
- [x] **37. customer session 抽象化 / #32 の refactor — 「とりあえず」を排除** (2026-05-21 完了)  
  目的: シンプルで拡張性ある顧客認証基盤を作る。具体的に:
  (a) `lib/customer-session.ts` を新規作成（`ensureCustomerSession()` / `getCustomerSession()`）。Server Action が呼ぶだけの primitive
  (b) `Cart.tsx` から `signInAnonymously` 直書きを撤去 → 元の form action 直結に戻す
  (c) `createOrderAction` を `ensureCustomerSession()` 経由に。fallback ロジック削除（必要時のみ sign-in する責務を primitive に集約）
  (d) `POLLING_INTERVAL_MS` を env 化（`NEXT_PUBLIC_ORDER_POLLING_MS`）
  (e) 設計ドキュ更新で「customer session abstraction」を明文化（将来 #11 顧客ログインの土台）
  (f) `lib/customer-session.ts` の unit test 追加
  1.5〜2 時間。
  Cart submit 時に `signInAnonymously()`、`createOrderAction` を session 必須化、RLS 変更（漏洩 policy DROP + anon GRANT REVOKE）、polling interval 30s → 10s。既存 `orders_user_own_select` を流用、新規 JWT 署名 infra 不要。詳細は `docs/customer-auth-design.md`。#26 の security test を unskip → PASS で完了。半日〜1 日。
- [ ] **33. 顧客 anonymous sign-in に CAPTCHA 導入（本格運用前）**  
  設計ドキュメント `docs/captcha-design.md` 作成済 (2026-05-26)。Cloudflare Turnstile 採択、Supabase Auth ネイティブ統合、Cart submit + お問い合わせ form 両方に適用。pilot 完走後に着手、約 1 日。
- [x] **34. anonymous user cleanup cron（90 日無活動）** (2026-05-22 完了)  
  Migration `20260522064802_orders_user_id_set_null.sql` で orders.user_id FK を SET NULL に。`/api/cron/cleanup-anonymous-users` 新規 (バッチ 100/run / `?dry=1` / `CLEANUP_ANON_USERS_ENABLED=1` flag / `is_anonymous=true` 絞り込み)。本番 deploy 完了、現状は flag off で dry-run のみ。スケジューラ登録 (#2) と flag 有効化はユーザー作業。
- [x] **35. `docs/deploy-runbook.md` 新規作成** (2026-05-22 完了)  
  8 セクション (種類別 checklist / pre-deploy active 注文確認 / smoke / security regression / rollback / 監視 / 落とし穴 / deploy 記録)。AGENTS.md / customer-auth-design.md / security-review / rls-review-checklist と相互参照。
- [x] **36. Server Action へのレート制限拡張** (2026-05-22 完了)  
  `proxy.ts` に `isServerActionRequest` 検出 (POST + next-action ヘッダー) と `checkServerActionRateLimit` を追加。30 req/min/IP の generic 制限。createOrderAction (anonymous sign-in spam) / loginAction (brute-force) 等の第二層防御に。新規 5 ケース proxy test 追加。

## 🟠 直近の品質改善

- [x] **5. GitHub Branch Protection で owner bypass を禁止** (2026-05-22 完了)  
  「Do not allow bypassing the above settings」を ON + 「Allow force pushes」を OFF。事故 #9 (force reset + 175 commit 並走) の再発を構造的に防ぐ。`Require pull request` は OFF のまま（1 人運用ではオーバーヘッド大、将来スタッフ参加時に ON 候補）。
- [ ] **6. 管理画面 Push 通知の実環境確認**  
  本番 VAPID キーで `notifyStore()` が届くか。新規注文受付通知が機能するか目視確認。30分
- [x] **7. 生成値のバックアップ** (2026-05-20 / 2026-05-27 完了)  
  二重 backup 体制:<br>
  (A) Secure Note「mocal - ローカル env 専用キー（2026-05-20 生成）」: locally-generated な secret 5 つ (`SESSION_SECRET` / VAPID 3 値 / `CRON_SECRET`)。再生成不可な値のみ。<br>
  (X) iCloud Drive 上の暗号化 sparsebundle `mocal-secrets.sparsebundle` の `secrets.txt`: 全 secret 13 個（Supabase / Stripe 含む全環境変数のスナップショット）。AES-256 暗号化 + パスフレーズは紙メモで物理保管。2026-05-27 にパスフレーズを過去セッション (`1ff03882...jsonl`) に残っていた一時 hex から恒久版に `hdiutil chpass` で変更済（jsonl 漏れリスクを解消）。<br>
  Vercel Dashboard を含めると **三重保管** (Vercel + (A) + (X))。Stripe live mode 移行時は live key を (X) の secrets.txt に追記、(A) は不変。<br>
  将来 [[7b]] 1Password 統合で (A)(X) を一本化予定（法人化タイミング）。
- [ ] **7b. 1Password への移行（法人化を見据えて）**  
  法人化（〜1年後想定）のタイミングで Teams 版へ。それまでは #7 の暫定運用。CLI `op inject` で `.env.local` を git に置かず都度展開する運用も検討。
- [x] **8. `README.md` の env 記述を最新化** (2026-05-24 完了)  
  README の env ブロック (削除済 ADMIN_* / 未記載の SESSION_SECRET, CRON_SECRET, STRIPE_CLIENT_ID, INQUIRY_NOTIFICATION_EMAIL, NEXT_PUBLIC_ORDER_POLLING_MS, CLEANUP_ANON_USERS_ENABLED, UPSTASH_* 等を含む) を `.env.local.example` 参照に置換。生成必要な値 (SESSION_SECRET / VAPID / CRON_SECRET) のコマンドのみ残す。deploy 節は `docs/deploy-runbook.md` への参照を追加
- [x] **9. 顧客キャンセル機能の実装** (2026-05-23 完了)  
  `paid` 状態の注文を顧客自身がキャンセル可能にする `POST /api/orders/[id]/cancel` を実装 ([mocal#11](https://github.com/dtsukoshi-hue/mocal/pull/11))。タグの UUID-as-token は F-18 後は危険なため、anonymous sign-in (`auth.uid() === order.user_id`) ベースに方針変更。10 unit tests、OrderStatusView にキャンセルボタン (paid 状態のみ)
- [x] **21. `.env.local` ノイズ変数の cleanup** (2026-05-22 完了)  
  9 変数 (NX_DAEMON / TURBO_CACHE / TURBO_DOWNLOAD_LOCAL_ENABLED / TURBO_REMOTE_ONLY / TURBO_RUN_SUMMARY / VERCEL / VERCEL_ENV / VERCEL_OIDC_TOKEN / VERCEL_TARGET_ENV) を削除。`.env.local` と `.env.local.example` の key が完全一致（optional 系 4 つの未設定を除く）。
- [x] **24. Stripe Webhook 冪等性レコード挿入順の修正（F-05）** (2026-05-22 完了)  
  `processed_webhook_events` INSERT が処理前に行われ、処理失敗時に 200 を返して Stripe retry を止めてしまう。注文 pending 永久放置のリスク。修正案 A/B/C を提示してユーザー判断。テスト追加必須。1時間。
- [x] **40. お問い合わせフォーム + 管理画面 + 通知 (recovery Phase R-4 / L9)** (2026-05-24 完了)  
  PR-A ([mocal#12](https://github.com/dtsukoshi-hue/mocal/pull/12)) で顧客送信フロー (migration + form + email)、PR-B で `/admin/inquiries` owner 限定一覧画面と settings からの導線を追加。`INQUIRY_NOTIFICATION_EMAIL` env を Vercel に登録すれば email 通知有効。ADMIN_STORE_ID / ADMIN_EMAIL は削除済 (#12) なので Push 通知は省略

## 🟡 中期の機能拡張（Phase 2）

- [ ] **10. マイページ「準備中」3項目**  
  FAQ / プロフィール編集 / 支払い方法。FAQ は 2026-05-24 完了 (recovery R-5 L8 で `app/(store)/faq/page.tsx` 復元、mypage の RowDisabled を RowLink に変更)。残るプロフィール編集 / 支払い方法は各半日〜1日
- [ ] **11. 顧客向けログイン機能**  
  Supabase Auth ベース。クロス端末で注文履歴を参照可能に。1〜2日
- [x] **12. ADMIN_* dead code 削除** (2026-05-22 / 2026-05-27 完了)  
  `lib/env.ts` REQUIRED と `.env.local.example` から削除、`.env.local` からも除去。コード参照ゼロ確認済 (Supabase Auth 移行後の残骸)。2026-05-27 に Vercel production / preview env からも `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_STORE_ID` を CLI 削除済 (`npx vercel env rm`)。
- [x] **13. `next build` ローカルハング調査** (2026-05-26 完了)  
  Next.js 16.2.6 更新 (#22) 後に再現せず。clean build (`rm -rf .next && npx next build`) が 6 秒で完走、`_not-found` collect の hang も無し。原因は 16.2.4 以前の Turbopack 不具合と推定、現状の依存セットでは解消済み。
- [ ] **14. キュー補正の調整**  
  **audit 結果 (2026-05-26)**: キュー補正は**未実装**。`app/api/orders/[id]/route.ts:136` で `estimated_ready_at = Date.now() + waitMinutes × 60s` を計算するだけで、同店舗の先行 `accepted` / `preparing` 注文を考慮していない。waitMinutes はスタッフが選ぶ手動値。  
  **改善案** (仕様判断必要・ユーザー確認待ち):  
  (A) accept 時に同店舗 `accepted`+`preparing` 件数を数え、`× N分` を `estimated_ready_at` に加算（最も backlog 文言に近い）  
  (B) 既存 queue の `estimated_ready_at` 最大値より前にならないよう clamp（直列処理前提・並列調理は反映しづらい）  
  (C) `estimated_ready_at` を「waitMinutes × 件数係数」で動的算出（係数を店舗設定可）  
  運用上スタッフが waitMinutes を実情で入力する前提なら不要かも。仕様判断後に実装、半日〜1日。
- [~] **15. 監視・アラート整備**  
  設計 `docs/monitoring-design.md` (2026-05-26) → scaffold 実装 (2026-05-28、PR 別途)。`@sentry/nextjs` 10.55 install、`sentry.{client,server,edge}.config.ts` + `instrumentation.ts` + `lib/logger.ts` で breadcrumb / captureException 統合、`lib/sentry-cron.ts` で 3 cron に Cron Monitor 統合、PII sanitize (cookie / authorization / email / ip) 込み。**`SENTRY_DSN` 未設定なら全て no-op で本番影響ゼロ**。<br>残: (a) user が Sentry account 作成 → DSN 取得 → Vercel + .env.local に登録 → (b) Sentry Dashboard で alert rule (5xx 急増 / cron failure / anonymous sign-in spike) 設定 → (c) Cron Monitor の slug 登録。
- [x] **16. E2E テストを CI で実行 (F-09)** (2026-05-22 完了)  
  `.github/workflows/ci.yml` に Playwright (chromium) ステップを追加。env を job 共通化、`Install Playwright browsers` → `E2E (Playwright)` → 失敗時 `Upload Playwright report` artifact (7日保持)。CI 上では dummy env のため Supabase 依存テストは graceful skip、LP/静的/セキュリティヘッダー等の browser テストが恒久 regression net に。
- [x] **41. cart 内税表示 (recovery Phase R-5 / L4)** (2026-05-24 完了)  
  cart 「合計」セクションに「うち消費税（10%）」行を追加。10% 内税前提で `Math.round(totalAmount - totalAmount / 1.1)` 計算
- [x] **42. アップセル提案 (recovery Phase R-5 / L5)** (2026-05-24 完了)  
  cart に「🎁 ご一緒にいかが？」セクション追加。カテゴリー判定 (`サイド`/`ドリンク`/`drink`等) で各 3 件まで suggest、カートに既にあるカテゴリーは表示しない。+ ボタンで cart に追加。MAX_QTY_TOTAL 到達時は section 自体を隠す
- [x] **43. 2-step UI: 注文確認 step (recovery Phase R-5 / L6)** (2026-05-24 完了)  
  Cart.tsx を `step: 'cart' | 'confirm'` で 2-step 化。Step 1 = カート編集 + アップセル、Step 2 = 受取方法 + 注文内容 (read-only + 編集リンク) + 備考 + お支払い内訳 + submit。pickup type の datetime-local 自由入力に切替、JST 補正の min/max 制約 (10分後〜3時間以内・server action と整合)
- [x] **44. 店舗キャンセル理由選択 UI audit + 復元 (recovery Phase R-5 / L10)** (2026-05-24 完了)  
  audit 結果: タグでは admin OrderCard に「在庫切れ / 店舗都合」ラジオが存在し PATCH `cancelledReasonType` を送信していたが、現 main では全て `store_cancel` 固定で送信していた。復元: `OrderActions.tsx` のキャンセル確認ダイアログに radio 追加、PATCH route で `cancelledReasonType` を accept、3 tests 追加 (out_of_stock / fallback / 不正値 400)
- [-] **45. 店舗オンボーディングフロー UI 差分 audit (recovery Phase R-5 / L12)** (2026-05-24 廃案)  
  audit 結果: タグの `/admin/onboarding` は **admin 向け「やることチェックリスト」** で、現 main の `/onboarding` は**新規店舗登録 form** と別機能。recovery-plan の L12 は誤認していた。タグ checklist の役割は現 main の `/admin/settings` の welcome ヒントで部分代替済み。新規復元の必要なし
- [ ] **46. コンボの variant / オプション選択 (popup) 機能** (新規発見・recovery 範囲外)  
  プロトタイプ (recovery 対象の `local-main-2026-05-19` タグより前) には「ポテトセット / ドリンクセット / ポテドリセット」など variant を持つ combo があり、ドリンクなど含まれる品目は popup から複数候補 (例: コーラ / ジンジャーエール / アイスティー…) を選択できる UI だった。現 schema (`combo_offers` + `combo_offer_items`) は **固定組み合わせのみ**で、variant / option_group / 選択肢の概念がない。**recovery 完了後**に対応。  
  **設計が必要なこと**:  
  (a) DB schema: `combo_option_groups (combo_id, name, label, min_select, max_select)` + `combo_option_choices (group_id, menu_item_id, sort_order)` 等  
  (b) admin UI: combo 作成時に「変更可能な品目グループ」を定義できる UI  
  (c) 顧客 UI: combo 選択時に未確定 variant があれば popup / sheet を出して選ばせる  
  (d) order_items 反映: 選択結果を combo_id + combo_label + 実 menu_item_id 込みで保存  
  (e) cart の qty 増減で variant 再選択させるか・初回固定にするかの仕様判断  
  プロトタイプ実装は失われている。設計から起こす必要あり。約 1〜2 日

## 🟢 長期（Phase 3）

- [ ] **17. マルチ店舗対応**  
  プロプラン用。複数店舗をまたぐオーナー・スタッフ管理。1〜2週間
- [ ] **18. teppay 対応**  
  Suica/PASMO 決済。2026年秋以降の加盟店登録待ち。判断保留
- [ ] **19. SMS 通知**  
  Twilio 等。Push 通知が一次手段なので低優先。1〜2日
- [ ] **20. マーケティング自動化**  
  注文後アンケート、リピート促進クーポン等。数日〜

---

## 関連ドキュメント

- `AGENTS.md` — 運用ルール・過去事故
- `docs/workflow.md` — アーキテクチャ全体図
- `docs/recovery-plan.md` — 2026-05-19 reset で失われた機能の復元計画 (#38 / #39 / #40 / #41〜45 の起点)
- `.env.local.example` — 必須環境変数と取得手順
- `lib/validation.ts` — 注文ステータス遷移定義
