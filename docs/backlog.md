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

## 直近完了マイルストーン（2026-05-28〜30）

- [x] **mocal.jp ドメイン取得 + Cloudflare 移管** — Xserver 取得 → Cloudflare 移管 (`desi/milan.ns.cloudflare.com`) → Vercel `mocal-iota.vercel.app` から `mocal.jp` へ完全移行
- [x] **Cloudflare Email Routing** — `support@mocal.jp` → `d.tsukoshi@gmail.com` 転送、Vercel ・特商法 page・Stripe ビジネス URL を `mocal.jp` ベースに統一
- [x] **Resend 送信基盤** — domain verify (DKIM/SPF/DMARC)、API key 発行、`RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `INQUIRY_NOTIFICATION_EMAIL` を Vercel + `.env.local` に登録
- [x] **Sentry DSN 取得 + 登録 (PR #32 の続き)** — Sentry account (GitHub OAuth)、Project、DSN を Vercel + `.env.local` に登録 (5 env 設定済)
- [x] **Stripe KYC 通過 (本番アカウント有効化)** — KYC 申請 + セキュリティ対策チェックリスト submit → 審査通過
- [x] **Stripe ビジネス URL を `mocal.jp` に更新**
- [x] **#payment Phase 4a (5 重防御 L2/L3/L4/L5)** — `lib/payment.ts` の NULL 経路を throw、公開フィルタ・admin ガード・UI 強化 ([mocal#35](https://github.com/dtsukoshi-hue/mocal/pull/35))。設計書 `docs/payment-design-legal.md` ([mocal#34](https://github.com/dtsukoshi-hue/mocal/pull/34))
- [x] **#payment 取次事業者モデル 移行開始 (Phase 4c PR-D)** — `stores.tokushoho_url` / `allergen_url` 追加 + admin UI で店舗オーナーが入力可能に ([mocal#36](https://github.com/dtsukoshi-hue/mocal/pull/36))

---

## 🔴 出荷ブロッカー

- [~] **1. 法人設立後の `/tokushoho` 更新**  
  2026-05-27 [mocal#31](https://github.com/dtsukoshi-hue/mocal/pull/31): 個人事業主の実値に第 1 弾更新 (氏名 / 住所 / 電話 / メール)。2026-05-30 [mocal#33](https://github.com/dtsukoshi-hue/mocal/pull/33): email を `support@mocal.jp` に切替。2026-05-30 [mocal#42](https://github.com/dtsukoshi-hue/mocal/pull/42) (Phase 4c PR-F): 取次事業者表記に改訂 (mocal は場の提供、各商品の販売者は各店舗)、2026-05-30 [mocal#46](https://github.com/dtsukoshi-hue/mocal/pull/46): 免責事項 + 関連事項追記 (内容拡充)。<br>**残**: 法人化時に法人名 / 法人所在地 / 法人連絡先に切替。
- [x] **2. cron 外部スケジューラを実稼働化** (2026-06-02 完了)  
  cron-job.org に 3 ジョブ登録完了: (a) `mocal store-hours` (`https://mocal.jp/api/cron/store-hours`, Every 1 hour `0 * * * *`)、(b) `mocal no-show` (`https://mocal.jp/api/cron/no-show`, Every 1 minute)、(c) `mocal cleanup-anon` (`https://mocal.jp/api/cron/cleanup-anonymous-users?dry=1`, Daily at 03:00)。各ジョブに `Authorization: Bearer <CRON_SECRET>` header 付与、Test run 全て HTTP 200 確認済。失敗通知 + 復旧通知 ON。設定手順は `docs/deploy-runbook.md` §9.1 に明文化済。**Pilot 中は cron-job.org で暫定運用、Pro 化後に `vercel.json` の `crons` へ移行**。
- [x] **3. `CRON_SECRET` を Vercel に登録** (2026-05-21 完了)  
  生成 → `.env.local` 追記 → Vercel (Prod/Preview/Dev) 登録 → Redeploy → 本番 curl で 401/200 を実証確認。F-03 解消。2026-06-02 [mocal#51](https://github.com/dtsukoshi-hue/mocal/pull/51) で `lib/env.ts` REQUIRED に追加 + 全 cron route が `if (!secret) return 503` で fail-closed 化。
- [x] **4. 新規店舗 onboarding の Stripe Connect 動作確認** (2026-06-02 完了)  
  `STRIPE_CLIENT_ID = ca_Ubu1hp3Go4JgDbO71HgGmFKeBCgudKqh` (live mode) を Vercel に登録 (production / development、preview は CLI 制約で別途要)、Redirect URI `https://mocal.jp/api/onboarding/stripe/callback` を Stripe Dashboard live mode の OAuth 設定に追加、Vercel production redeploy 済。OAuth flow は sandbox で動作確認済 (signState HMAC + Stripe redirect)。**live mode での実際の店舗 onboarding は #51 audit でテスト店舗作成時に本確認**。
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

### Pilot 開始ブロッカー (2026-05-30 追加)

- [x] **47. Stripe Connect サンドボックス設定 + live mode 有効化** (2026-06-02 完了)  
  Stripe Workbench sandbox で Connect 設定完了 (ビジネスモデル「マーケットプレイス」、アカウントタイプ Standard、Charge type Destination Charges、OAuth 有効化 + sandbox Client ID `ca_Ubu1IbhexaIgrGXonMvfPvT2KsUEoX0T`)、Connect OAuth flow テスト成功 (mocal の signState HMAC + Stripe → callback の流れ)。**live mode は別途 Connect が有効化済** (KYC 通過済の Entrust 本番アカウント、live mode Client ID `ca_Ubu1hp3Go4JgDbO71HgGmFKeBCgudKqh`) — 別途審査申請は不要だった (Stripe Connect Standard は KYC 通過 + サンドボックス確認後に live で即利用可)。
- [x] **48. Stripe live mode env 切替** (2026-06-02 完了)  
  **サブタスク完了状況**:<br>
  - **[x] #48a 公開キー + シークレットキー切替** (2026-05-30 完了):<br>
    - `STRIPE_SECRET_KEY` = `sk_live_*` → user が Vercel Dashboard 直接更新 (Sensitive、production / preview / development)<br>
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_51TPIyDLGTKV4sBVUBeK69R4e30RQBFo8C3H4C8Fr74z3XV8XknmjnaKX5C8h5t3isbMlLJVQemROTXMtLzr6Dbpr00HGk24yiH` → Vercel CLI で代行 (production / development)<br>
    - active 注文 0 件確認 → `npx vercel deploy --prod --yes` → `curl https://mocal.jp/api/health` 200 ✓<br>
    - `.env.local` は **test mode 維持** (ローカル開発は test カードで継続、Pilot smoke は production の live mode で実施、user 合意済)<br>
    - **残**: preview 環境の `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 追加 (CLI v54 で `--git-branch` 制約のため Vercel Dashboard で user 手動追加が必要、優先度低)<br>
  - **[x] #48b live mode webhook 登録 + `STRIPE_WEBHOOK_SECRET` 切替** (2026-06-02 完了):<br>
    - Stripe Dashboard live mode で endpoint `mocal 本番 webhook` 作成 (`https://mocal.jp/api/webhook/stripe`)<br>
    - Events: `payment_intent.succeeded` / `payment_intent.payment_failed` / `charge.refunded` の 3 件<br>
    - API バージョン: `2026-03-25.dahlia` (default)、イベント宛先スコープ: 「お客様のアカウント」 (Platform-level)<br>
    - 表示された `whsec_*` を user が Vercel Dashboard 直接更新 (Sensitive、Production / Preview / Development 全環境)、production redeploy 完了<br>
  - **[x] #48c `STRIPE_CLIENT_ID` (live mode)** (2026-06-02 完了):<br>
    - `STRIPE_CLIENT_ID = ca_Ubu1hp3Go4JgDbO71HgGmFKeBCgudKqh` を Vercel CLI で登録 (production / development、preview は CLI 制約で手動別途)<br>
    - Stripe Dashboard live mode の OAuth Redirect URI に `https://mocal.jp/api/onboarding/stripe/callback` を追加<br>
    - production redeploy 完了、`/api/health` 200 確認
- [x] **49. #payment Phase 4c (取次事業者モデル 完成)** (2026-05-30 完了)  
  Phase 4a (#35) + PR-D (#36) で基盤、Phase 4c で取次事業者モデル完成:<br>
  - **PR-A** (完了、2026-05-30 [mocal#39](https://github.com/dtsukoshi-hue/mocal/pull/39)): `docs/payment-design-legal.md` §3 (採用モデル) を「mocal は取次事業者」に書き直し<br>
  - **PR-B** (完了、2026-05-30 [mocal#40](https://github.com/dtsukoshi-hue/mocal/pull/40)): `lib/payment.ts` paymentIntents.create に `on_behalf_of` 追加 → Stripe 上の merchant of record が店舗に<br>
  - **PR-E** (完了、2026-05-30 [mocal#41](https://github.com/dtsukoshi-hue/mocal/pull/41)): `/[slug]` 店舗ページのフッタに特商法 / アレルゲン外部リンクを表示<br>
  - **PR-F** (完了、2026-05-30 [mocal#42](https://github.com/dtsukoshi-hue/mocal/pull/42)): mocal `/tokushoho` を取次事業者表記に書き直し<br>
  順序実績: PR-A → PR-B/E/F 並列。残: pilot 開始前の弁護士確認 (`docs/payment-design-legal.md` §7 未解決事項)。
- [x] **50. #payment Phase 4b (DB CHECK 制約 + 既存 1 row 是正)** (2026-06-02 完了)  
  - **(a) 既存 1 row 是正**: 3000DAYS BURGER 清澄白河本店 を `UPDATE stores SET is_open=false, manual_override_until=NOW()+INTERVAL '7 days' WHERE name='3000DAYS BURGER 清澄白河本店'` で `is_open=false` に + cron 自動 ON 抑制 (`manual_override_until` 7 日後)。<br>
  - **(b) CHECK 制約 apply**: Supabase SQL Editor で `ALTER TABLE stores ADD CONSTRAINT stores_stripe_account_required CHECK (NOT is_open OR stripe_account_id IS NOT NULL)` 実行済。<br>
  - **動作 verify**: `stripe_account_id IS NULL` の店舗を `is_open=true` に切替試行 → DB レベルで `check constraint violated` で弾かれることを confirm。<br>
  - migration file (`supabase/migrations/20260530220000_stores_stripe_account_required.sql`) は repo に追加済 ([mocal#48](https://github.com/dtsukoshi-hue/cnen/pull/48))。本番 DB への apply は SQL Editor で直接実施 (`npx supabase db push` 不使用)。<br>
  - 5 重防御の全層完成 (L1 CHECK / L2 公開フィルタ / L3 createPayment throw / L4 admin guard / L5 onboarding UI / L6 createOrderAction check)。
- [ ] **51. Pilot 開始前 実機 audit**  
  以下を実機で 1 件ずつ動作確認:<br>
  - **#6 管理画面 Push 通知** (iOS / Android で `notifyStore()` が届くか、新規注文 → 受付状態切替で動作確認)<br>
  - **顧客側 Push 通知** (iOS / Android で `notifyOrder()` が届くか、accepted / ready / cancelled 各 status で確認)<br>
  - **Realtime 接続** (顧客側 `/orders/[id]` で status 変更が即時反映されるか)<br>
  - **復元機能 L1〜L10** (recovery-plan §2 の 10 項目: コンボ表示・購入 / 顧客キャンセル / アップセル / 2-step UI / FAQ / お問い合わせ / 店舗キャンセル理由選択 等)<br>
  - **失敗 / 返金フロー** (`docs/payment-flow.md` 図 B の経路 1〜8 を順次): 顧客 cancel / 店舗 cancel / 外部返金 sync / payment_failed / store 閉店中 succeeded / amount mismatch / no_show / pending timeout<br>
  チェックリスト形式で結果を残す。
- [ ] **52. Pilot 開始 smoke (live mode 1 件決済)**  
  実カードで 1 件注文 → pending → paid → accepted → preparing → ready → completed の全 status 遷移 → 払戻 (refund) → no-show 経路 (別注文)。Stripe Dashboard と mocal の DB 両方で正常完了を確認。約 1h。
- [ ] **53. Go/No-Go 判定**  
  下記「Pilot 開始 Go/No-Go 基準」全 must を `[x]` 確認 → user が pilot 開始判断。

### Onboarding & Auth 基盤再設計 (2026-06-03 起票、pilot R2 ブロック)

2026-06-03 セッションで `R2: テスト店舗を live mode で新規作成` 着手時に現行 onboarding フローの構造的欠陥を 4 件発見 (確認メール経路で店舗が永久に作られない / staff invite が実質動かない / Supabase default SMTP / 英語テンプレ)。加えて多店舗対応 / bounce 検知 / audit log / slug 予約語の拡張性懸念。

「pilot 1 店舗で動いても 2 店舗目で必ず破綻」する base 欠陥のため、pilot 開始前に基盤として正しく作り直す方針を user 承認 (2026-06-03)。詳細設計は `docs/onboarding-auth-redesign.md`。

- [x] **61. PR-1: Resend SMTP + 5 branded email templates** (2026-06-03 完了、PR [#57](https://github.com/dtsukoshi-hue/hue/pull/57) + [#58](https://github.com/dtsukoshi-hue/mocal/pull/58))  
  Supabase Auth の SMTP を default (mail.app.supabase.io) → Resend (support@mocal.jp from) に切替。5 種テンプレ (Confirm signup / Invite / Reset password / Change email / Reauthentication) を日本語 + mocal ブランド HTML 化。`docs/email-templates/*.html` を canonical として commit、Dashboard へ paste 運用。Redirect URLs allowlist に `/auth/confirm` `/auth/invite-accept` `/admin/reset-password` を追加。DNS で `_dmarc.mocal.jp` policy 確認 (p=none なら別 PR で quarantine 化推奨)。工数: 私 2h + user 1h。依存なし、最初に着手。

- [x] **62. PR-2: Onboarding 再設計 + 多店舗対応 + slug 予約語** (2026-06-03 完了、PR [#59](https://github.com/dtsukoshi-hue/mocal/pull/59) + hotfix [#62](https://github.com/dtsukoshi-hue/mocal/pull/62))  
  本番 smoke で PKCE callback の取りこぼし + Supabase の obfuscated user (identities=[]) 検出漏れの 2 欠陥が連鎖発火し Sentry に FK violation (23503) を出した。hotfix で 4 層防御 (L1 template の token_hash 形式化 / L2 route の ?code= 経路追加 / L3 identities=[] 検出 / L4 23503 catch) を実装し再 smoke 成功。新規 user で `test4` store 作成を完全 verify。詳細は session_handoff.md §学び 1-7 参照。  
  `pending_signups` テーブル + `create_store_with_owner` RPC migration 追加。`app/actions/onboarding.ts` を 2 mode (新規 / ログイン中多店舗) に書き換え、確認メール送信を成功状態として返す。`app/auth/confirm/route.ts` 新規追加 (verifyOtp + RPC + idempotent)。`app/onboarding/page.tsx` に query (error / resume / prefill) 対応と多店舗フロー追加。`lib/slug-reservation.ts` で reserved slugs reject。Upstash rate limit (5 req/min/IP) + Sentry capture。既存 3000DAYS 店舗 login の回帰テスト必須。工数: 6-8h。PR-1 merge 後。

- [ ] **63. PR-3: Auth endpoint rate limit + Sentry**  
  `/admin/login` (IP + email per、5 failures → 5 min lockout) / `/admin/reset-password` (per email) / `/auth/confirm` (per IP、defense in depth) に Upstash rate limit。Sentry tag を auth 系全 endpoint に統一。工数: 2h。PR-1 merge 後。

- [ ] **64. PR-4: Staff invite 再設計 (自前 token、Supabase invite 不使用)**  
  Supabase の `auth.admin.inviteUserByEmail` は `data` が user_metadata 行きで改竄可能 (`invited_to_store_id` 偽造リスク) のため使わない。`pending_invitations` テーブル + 32-byte secure token + `lib/email.ts` 経由の自前招待メール。`/auth/invite-accept` route で token 検証 + signUp/signIn + store_members insert。`InviteStaffForm` の「事前登録必須」を廃止し email 入力だけで OK に。工数: 4-5h。PR-2 merge 後。

- [ ] **65. PR-5: Resend webhook (bounce / complaint 検知)**  
  Resend Dashboard で webhook 登録 (`https://mocal.jp/api/webhook/resend`、`RESEND_WEBHOOK_SECRET` env 追加)。Svix signature 検証 + `email.bounced` / `email.complained` を Sentry breadcrumb + `auth.users.user_metadata.email_delivery_status='bounced'` でマーク。admin UI 警告表示は別 backlog。工数: 2-3h。PR-1 merge 後。

- [ ] **66. PR-6: store_member audit log**  
  `store_member_events` テーブル (event_type: added/removed/role_changed, actor/target/role_before/role_after)。既存 add/remove actions に insert 追加。RLS: store の owner SELECT 可 + service role only INSERT。UI は本 PR 範囲外。工数: 2-3h。PR-2 / PR-4 merge 後。

- [ ] **67. PR-7: Tests + docs + backlog 整理 (本 redesign の締め)**  
  vitest 全 PR の test ファイル整備 (~40 件追加目安)。`docs/customer-auth-design.md` を「顧客 anon + 店舗オーナー auth + staff invite 統合設計書」に書き換え。`docs/workflow.md` の図に新 route / table ノード追加。`docs/email-templates/README.md` 完成 (canonical 運用ルール)。本 redesign の周辺 backlog 整理 (#10 顧客ログイン / #17 マルチ店舗 / #59 staging 等との依存明記)。工数: 3-4h。全 PR と並行可。

- [ ] **68. mocal.jp DMARC policy 設定 (pilot 前)** (2026-06-03 起票、PR-1 受け入れ時に DMARC 未設定を発見)  
  `dig TXT _dmarc.mocal.jp +short` で **出力なし** = DMARC レコード未設定の状態。**SPF/DKIM は Resend で設定済 + 通過実績あり**だが、DMARC が無いと:<br>
  - mocal.jp ドメインを誰でも spoof 可能 (詐欺メールに mocal.jp を使われても通報経路がない)<br>
  - 一部メールプロバイダ (Yahoo 等) で DMARC 必須化が進行中 → 将来の配信率低下リスク<br>
  - 監査時の指摘事項になりやすい<br>
  **対応 (user 作業、DNS 編集 5 分)**: mocal.jp の DNS provider (Cloudflare / Vercel DNS 等) で TXT record 追加:<br>
  - Name: `_dmarc.mocal.jp` (or `_dmarc`)<br>
  - Type: TXT<br>
  - Value: `v=DMARC1; p=none; rua=mailto:support@mocal.jp; ruf=mailto:support@mocal.jp; fo=1`<br>
  **段階強化**: 最初 `p=none` (監視モード、SPF/DKIM 失敗してもブロックしない) で 1-2 週運用 → 週次 report で問題ないこと確認 → `p=quarantine` に強化 → さらに 1-2 週 → `p=reject` で完全防御。`rua` でレポート集計 email、`ruf` で失敗詳細。工数: DNS 5 分 + 段階強化期間で計 1 ヶ月程度。pilot 前に `p=none` まで完了が目標。

合計工数: ~25h (3-4 営業日) + #68 5 分。R2 は PR-61〜67 全 merge 後に再開。

### Pilot 開始までの推奨実施順 (2026-06-02 update — 残作業のみ)

このセッション (2026-06-02) で順 1〜14 のうち user 作業大半 + Phase 4c PR (#49 PR-A/B/E/F) 全部完了。残作業のみ再掲:

| 順 | 項目 | 工数 | 主体 | 状態 |
|---|---|---|---|---|
| ~~**R1**~~ | ~~**#15(a) Sentry Alert rule 設定**~~ (2026-06-03 完了) Rule 1 `New error issue` (WHEN new issue + IF level≥error → Email) / Rule 2 `Cron monitor failure` (WHEN new issue + IF tag `monitor.slug` is one of `no-show,store-hours,cleanup-anonymous-users` → Email)。Issue Alert UI 簡素化により Rule 1 は spike → 新規 error issue 検知にダウングレード。spike rule は #60 で pilot 後追加 | 10 分 | user | [x] 完了 |
| ~~R2~~ | ~~**テスト店舗を live mode で新規作成**~~ (2026-06-03 sign up 部分完了、`d.tsukoshi@me.com` で `test4` store 作成 + 多店舗分離 verify 済)。**残**: 同店舗で Stripe Connect onboarding (live mode KYC) | 10〜15 分 + Stripe KYC 数分 | user | [~] 進行中 (sign up 完了、Stripe 接続のみ残) |
| R3 | テスト店舗にメニュー登録 (100-200 円 × 1-2 件) | 5 分 | user | R2 後 |
| R4 | **#15(c) `SENTRY_AUTH_TOKEN` 登録** (source map upload 有効化) + **Sentry GitHub Integration 設定** (2026-06-03 install 済、未 configure。Settings → Integrations → GitHub → Configurations で `dtsukoshi-hue/mocal` connect + Code Mappings で `app/` 等を設定。stack trace から GitHub source へジャンプ + suspect commit 検出が有効化) | 20 分 | user | pilot 直前、いつでも可 |
| R5 | **#51 Pilot 実機 audit** (Push iOS/Android / Realtime / L1-L10 / 図 B 8 経路) | 2〜3h | user + 私 | R2-R3 完了後 |
| R6 | **#52 Live smoke** (実カード 1 件 → 全 status 遷移 → refund) | 1〜1.5h | user + 私 | R5 通過後 |
| R7 | **#53 Go/No-Go 判定** | 30 分 | user | 最後 |

### 完了済の旧優先順 (記録、2026-05-30〜06-02)

順 1 (#47 Stripe Connect)、順 2 (#48a)、順 3 (#48b)、順 4 (#2 cron)、順 5 (#15(b))、順 6-9 (#49 PR-A/B/E/F)、順 11 (#47 通過待ち = sandbox で動作確認済み + live mode は既に有効化)、順 12 (#48c)、順 13-14 (#50 a + b) は全部済。

### Pilot 開始 Go/No-Go 基準

**Must (1 つでも欠ければ pilot 開始不可)**:
1. [x] #47 Stripe Connect live mode 有効化 + `STRIPE_CLIENT_ID` 登録 (2026-06-02 完了)
2. [x] #48 Stripe live mode env 切替 (`sk_live_*` / `pk_live_*` / live `whsec_*`) (2026-06-02 完了)
3. [x] #49 Phase 4c 完了 (PR-A/B/E/F 全て merged) (2026-05-30 完了)
4. [x] #50 Phase 4b 完了 (DB CHECK + 既存 1 row 是正) (2026-06-02 完了)
5. [x] #2 cron 3 ジョブ稼働中 (2026-06-02 cron-job.org 登録完了、Test run 200 OK)
6. [ ] #51 実機 audit 全項目 ✓
7. [ ] #52 live mode smoke (1 件決済 → 全 status 遷移 → 返金) 完了
8. [x] #1 mocal `/tokushoho` の取次事業者表記 (#49 PR-F) 反映済 (2026-05-30 [mocal#42](https://github.com/dtsukoshi-hue/mocal/pull/42))
9. [ ] 各店舗 (#47 完了店舗) の特商法 URL / アレルゲン URL 入力済 (#36 で追加した admin UI 経由) ← テスト店舗 (R2) 作成時に入力

**Should (推奨だが pilot 中に追従可)**:
10. [x] #15 Sentry alert rule + Cron Monitor slug 登録 (slug 登録 2026-06-02、alert rule 2 件 2026-06-03 完了)
11. [ ] #33 CAPTCHA (anonymous sign-in spam 防御)

**Nice to have (pilot 後でも問題ない)**:
- backlog の 🟡 / 🟢 セクション全般

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
- [x] **54. 失敗 / 返金フロー test coverage audit** (2026-05-30 完了)  
  図 B の 8 経路 audit 結果:<br>
  | 経路 | カバー状態 | テスト |<br>
  |---|---|---|<br>
  | 1. 顧客 cancel | ✅ | `tests/api/orders-id-cancel.test.ts` 10 ケース |<br>
  | 2. 店舗 cancel | ✅ | `tests/api/orders-id-patch.test.ts` 10+ ケース |<br>
  | 3. 外部返金 sync (charge.refunded) | ⚠️ filter 冪等 OK、副作用 bug → **#57** | `tests/api/webhook-stripe.test.ts` 3 ケース (本タスクで冪等性ケース追加、現状の副作用挙動を verify) |<br>
  | 4. payment_failed | ✅ | `tests/api/webhook-stripe.test.ts` 2 ケース |<br>
  | 5. webhook 内 自動 cancel + refund (store_closed / amount_mismatch) | ✅ | `tests/api/webhook-stripe.test.ts` 3 ケース |<br>
  | 6. PI 作成失敗 (createPayment throw) | ✅ (本タスクで追加) | `tests/actions/orders.test.ts` |<br>
  | 6'. order_items.insert 失敗 | ✅ (本タスクで追加) | `tests/actions/orders.test.ts` |<br>
  | 7. no_show | ✅ | `tests/api/cron-no-show.test.ts` 4+ ケース |<br>
  | 8. pending timeout | ✅ | `tests/api/cron-no-show.test.ts` 1 ケース |
- [x] **57. webhook charge.refunded の二重通知バグ** (2026-05-30 完了、#54 audit 中に発見)  
  `app/api/webhook/stripe/route.ts:264-280`: update 自体は `.neq('status', 'refunded')` で冪等 (0 行 update) だが、update が 0 行でも `notifyOrder` を呼んで顧客に二重通知が届く可能性があった。<br>
  修正: update に `.select('id')` を chain して `updatedRows` を取得、`updatedRows.length === 0` なら `break` で notify skip。`docs/payment-flow.md` 図 B [3] にも 1 行追加。`tests/api/webhook-stripe.test.ts` の対応テストを修正後挙動 (0 行 → notify not called) に書き換え。
- [~] **56. mocal.jp の noindex 化 (pilot 開始まで)** (2026-05-30 緊急対応)  
  Google 検索結果に mocal.jp が表示されていた指摘を受け、`app/layout.tsx` `metadata.robots` を `{ index: false, follow: false }` に、`app/robots.ts` を `disallow: '/'` に変更 (全 page クロール禁止 + meta noindex の二重)。**pilot 開始時に解除予定** (`app/layout.tsx` を `{ index: true, follow: true }` / `app/robots.ts` を `allow: '/'` + 管理系 disallow に戻す)。既に indexed 済の URL は **user 側で Google Search Console から URL 削除リクエスト** を推奨 (noindex の Googlebot 反映待ちより速い)。
- [ ] **58. code-review cleanup 一括 (pilot 後)** (2026-05-30 起票、code-review (B + high effort) finding 2-5 より)  
  Pilot 直前の code-review で挙がった軽微な cleanup を pilot 後にまとめて 1 PR で対応:<br>
  - **finding 2 (DRY)**: `app/(store)/[slug]/page.tsx` StoreLegalFooter の `<a target=_blank rel=noopener noreferrer>` 2 件を `[{href,label}]` 配列 + map で集約 (将来 URL field 追加時に行追加 1 行で済む)<br>
  - **finding 3 (altitude / reuse)**: `app/actions/store.ts` の inline `parseUrl` を `lib/url-validation.ts` の `parseOptionalHttpUrl(value, fieldLabel)` として共通 helper 化 (将来 menu_items.url 等で再利用想定)<br>
  - **finding 4 (type narrowing)**: `parseUrl` の戻り値 `string | null | { error: string }` を tagged union (`{ok: true, value: string|null} | {ok: false, error: string}`) または例外スロー化で narrowing 明示化<br>
  - **finding 5 (reuse)**: `app/tokushoho/page.tsx` の `Table` コンポーネントを `app/_components/LegalTable.tsx` (or `<dl>` semantic 共通 component) に昇格、`app/privacy/page.tsx` でも再利用<br>
  finding 1 (parseUrl URL constructor 化) は別途 [mocal#49](https://github.com/dtsukoshi-hue/customer-issue/pull/49) で先行対応済 (defense in depth、pilot 前)。本タスクは pilot 後の品質向上 cleanup として 1〜2h で 1 PR にまとめる。
- [ ] **60. Sentry Metric Alert で 5xx spike rule 追加 (pilot 後)** (2026-06-02 起票、#15(a) Rule 1 ダウングレードの補完)  
  pilot 期は #15(a) Rule 1 (新規 error issue → email) で取りこぼし防止に注力。トラフィック蓄積後 (Go-live 後 2-4 週) に Sentry **Metric Alert** で「5 分間 error event > 閾値」型の spike rule を追加。<br>
  理由: 現 Sentry Issue Alert UI から frequency 系トリガーが Metric Alert 側に移行。pilot 期は平常値 (baseline) のデータがなく閾値が勘になるため、データ蓄積後にキャリブレーションして導入する方が誤検知が少ない。<br>
  作業: Sentry Dashboard → Alerts → Create Alert → Metric Alert → events count > N in 5 min → email。N は pilot 蓄積データから決定 (目安: 平常値の 3-5 倍)。
- [ ] **69. ログイン中 user の `/onboarding` 訪問時に未完了 pending を auto-detect → resume UI 表示** (2026-06-03 起票、#62 hotfix の audit で発見)  
  現状 `/auth/confirm` で store 作成が失敗 (server error) すると `?resume=1` 付きで `/onboarding` に redirect され ResumeUI が表示される。しかし user が手動で `/onboarding` を訪問した場合 (URL 直打ち or 別経路から到達) は `?resume=1` が付かず、`add-store form` が表示されるため pending 未完了状態に気付けない。<br>
  **対応**: `app/onboarding/page.tsx` の server component で、ログイン中かつ `pending_signups.status !== 'completed'` の行が存在する場合は ResumeUI を自動表示する (`?resume=1` query 不要)。多店舗追加の本来の add-store flow と区別するため、`pending` 行があるときのみ ResumeUI を優先。<br>
  工数: 1-2h。test 含めて 1 PR で済む規模。本 onboarding redesign の細部 UX 改善。

## 🟡 中期の機能拡張（Phase 2）

- [ ] **59. Supabase staging project の導入** (2026-06-02 起票、localhost テスト方針の再考から)  
  現状 mocal は Supabase project 1 つ (production) のみ。`.env.local` も production を指すため、ローカル開発で test 店舗 / orphaned user 等を作ると**本番 DB に書き込まれる**。Pilot smoke (#52) 前の動作確認をローカルで安全に行うには分離が必要。<br>
  **方針**:<br>
  - Supabase で **staging project** を作成 (本番 project と別 URL / Anon Key / Service Role Key)<br>
  - 本番 → staging への schema 同期手順 (`supabase db dump --linked` → staging に restore) を `docs/deploy-runbook.md` に追加<br>
  - `.env.local` を staging を指すように切替、production env (Vercel) のみ本番 project<br>
  - 過去事故 #4 (DB 列名乖離) / #6 (本番未整合 deploy) と同型のリスクを構造的に閉塞<br>
  **実施タイミング**: pilot 完走後、Phase 2 で対応。pilot 中は本番 1 個で運用、テスト data は cleanup script で削除する運用で凌ぐ。<br>
  工数: 半日 (project 作成 + schema 同期手順 + 設計ドキュメント)。
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
  設計 `docs/monitoring-design.md` (2026-05-26) → scaffold ([mocal#32](https://github.com/dtsukoshi-hue/mocal/pull/32)、2026-05-28) → DSN + 関連 env 登録済 (2026-05-29、Sentry 接続中)。<br>
  **進捗 2026-06-02**:<br>
  - **[x] (b) Cron Monitor slug 登録** (2026-06-02 完了): mocal の `lib/sentry-cron.ts` `startCronCheckIn()` 経由で Sentry が **auto-created**。3 件確認済 (`no-show` / `store-hours` / `cleanup-anonymous-users`)。store-hours の expected schedule が `*/5 * * * *` で誤っていたため [mocal#53](https://github.com/dtsukoshi-hue/mocal/pull/53) で `0 * * * *` に修正。<br>
  - **[ ] (a) Alert rule 設定** (次セッション、10 分): 2 件設定予定 — **Rule 1**: Sentry Issue Alert で `Number of events in an issue is more than 10 in 5 minutes` trigger + IF event.level=error + Email + 30 分 throttle (rule name: `Error event spike (per issue)`)。**Rule 2**: Issue Alert で WHEN A new issue is created + IF tag `monitor.slug` in [no-show, store-hours, cleanup-anonymous-users] + Email + 30 分 throttle (rule name: `Cron monitor failure`)。**Rule 3 (Anonymous sign-in spike)** は pilot 後の別 PR で実装 (`lib/customer-session.ts` に `Sentry.captureMessage('anonymous sign-in created', { level: 'info' })` 追加 + frequency alert)。<br>
  - **[ ] (c) `SENTRY_AUTH_TOKEN` 取得 + 登録** (pilot 直前、15 分): Sentry → User Settings → Auth Tokens → Create New Token (scopes: `project:releases` / `org:read`) → Vercel `SENTRY_AUTH_TOKEN` 登録 (Sensitive) で source map upload 有効化。<br>
  - **[ ] (d) Sentry Project rename `javascript-nextjs` → `mocal`** (任意)。
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
- [ ] **55. Stripe Connect アカウント無効化への動的対応** (2026-05-30 起票、`docs/payment-flow.md` 図 C より発見)  
  5 重防御は `stripe_account_id IS NULL` を弾くが、SET されている account が後で suspended / restricted になる場合は弾けない。<br>
  対応案:<br>
  - Stripe webhook `account.application.deauthorized` / `account.updated` を購読 → DB の `stripe_account_id` を NULL に戻す<br>
  - 決済前に `accounts.retrieve` で last_check (TTL cache)<br>
  pilot 開始後に運用観点で必要性を判断。約 1 日。

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
- `docs/payment-design-legal.md` — 決済設計の法的整合性 (取次事業者モデル、5 重防御。#49 Phase 4c で §3 改訂予定)
- `docs/payment-flow.md` — 決済フロー 3 枚 (A: happy path / B: 失敗・返金 / C: 法的当事者 + 5 重防御)。#54 / #55 の起点
- `docs/monitoring-design.md` — Sentry / Cron Monitor 設計 (#15)
- `docs/captcha-design.md` — Cloudflare Turnstile 設計 (#33)
- `docs/customer-auth-design.md` — 顧客認証設計
- `docs/deploy-runbook.md` — デプロイ手順 + 初回セットアップ (cron-job.org §9.1 / Stripe Connect §9.2)
- `.env.local.example` — 必須環境変数と取得手順
- `lib/validation.ts` — 注文ステータス遷移定義
