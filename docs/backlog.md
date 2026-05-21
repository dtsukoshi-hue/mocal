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
- [ ] **2. cron 外部スケジューラを実稼働化**  
  `vercel.json` の `crons` は空。cron-job.org 等から `Authorization: Bearer ${CRON_SECRET}` で `/api/cron/store-hours`（5分）と `/api/cron/no-show`（1分）を叩く。1〜2時間
- [x] **3. `CRON_SECRET` を Vercel に登録** (2026-05-21 完了)  
  生成 → `.env.local` 追記 → Vercel (Prod/Preview/Dev) 登録 → Redeploy → 本番 curl で 401/200 を実証確認。F-03 解消。
- [ ] **4. 新規店舗 onboarding の Stripe Connect 動作確認**  
  `STRIPE_CLIENT_ID` が Vercel env に無く `/api/onboarding/stripe/connect` が 500 になる。新規店舗追加時に必須。1時間
- [x] **22. Next.js 16.2.4 → 16.2.6 セキュリティ更新（F-02）** (2026-05-21 完了)  
  next 16.2.6 + overrides で postcss ^8.5.15 / brace-expansion ^5.0.6。`npm audit` 3 → 0、180 tests pass、本番 smoke 全 200、CSP nonce / security headers / cron 認証も regression なし。
- [x] **23. Supabase migrations を repo に取り込む（F-01）** (2026-05-21 完了)  
  supabase CLI を dev dep として導入、`db pull` で `20260521013317_remote_schema.sql` 生成 (1208 行)。auto-gen `database.types.ts` の helper エイリアスを `database.aliases.ts` に分離、11 ファイルの import を切替、`store-cache.ts` で narrow cast 追加（DB の CHECK 制約と整合）。RLS レビューで重大 finding → 新規 #25 として追加。
- [~] **25. RLS の `orders` / `order_items` anon SELECT 漏洩（F-18 / 🔴 出荷ブロッカー）**  
  `CREATE POLICY orders_public_select_by_uuid ON orders FOR SELECT USING (true)` + `GRANT ALL ... TO anon` により、anon キーで全 orders / order_items を SELECT 可能（UUID 列挙攻撃可能・PII 漏洩）。本番実証済み。  
  **採択方針**: A+ (注文ごと専用 JWT 発行 + RLS で `auth.jwt() ->> 'order_id'` 検証)。  
  Step 0 (#26〜#30 再発防止策) → Step 1 (#31 設計ドキュメント) → Step 2 (#32 実装) の順で進める。
- [x] **26. anon REST アクセスのセキュリティ regression test 追加（P1）** (2026-05-21 完了)  
  `tests/security/anon-rest-access.test.ts` (11 ケース) + `npm run test:security` script。`.env.local` を直接読んで `process.env` 汚染なし、`RUN_SECURITY_TESTS=1` flag で意図実行。現状 F-18 を正しく検出（orders / order_items / processed_webhook_events で 3 FAIL）。default `npm test` には影響なし (180 pass / 11 skipped)。**A+ 実装後にガードを外して default 実行に組み込み、CI で恒久監視**する。
- [ ] **27. RLS policy レビューチェックリスト作成（P2）**  
  `docs/rls-review-checklist.md`。`USING (true)` 禁止原則、`GRANT ALL ... TO anon` 禁止、公開テーブル明示リスト等。30分。
- [ ] **28. workflow.md / AGENTS.md の bearer-token 表現整備（P3+P4）**  
  workflow.md「UUID = bearer token」を JWT proof-of-access ベースに改訂、AGENTS.md に「Supabase RLS の罠」セクション追加（`USING (true)` の誤解を明記）。30分。
- [ ] **29. `supabase db lint` 等の自動 RLS 検査（P5 / 調査タスク）**  
  pre-push に組み込めるか調査。導入可能なら次タスク化。1時間（調査）。
- [ ] **30. 旧 .archive 内 migrations の整合確認**  
  `.archive/supabase-migrations-legacy/` と現実 DB の差分を読み、参考価値があるか判断。無価値なら削除提案。30分。
- [ ] **31. 顧客 JWT 認証設計ドキュメント作成（A+ Step 1）**  
  `docs/customer-jwt-design.md`。claim 構造 / TTL / 署名鍵 / 発行 endpoint / URL 形式（fragment vs query）/ 既存注文の backfill / rollback 計画 / Realtime 連携 / 漏洩時 rotation 手順。Opus が書く → ユーザー承認 → #32 へ。1〜2時間。
- [ ] **32. 顧客 JWT 認証の実装（A+ Step 2 / #25 修正本体）**  
  `orders.access_token` 列追加、JWT 発行 endpoint、RLS 書き換え、URL 構造変更、email/push の URL 更新、テスト追加。#26 の test を unskip して PASS 確認、本番 smoke。1〜2日。

## 🟠 直近の品質改善

- [ ] **5. GitHub Branch Protection で owner bypass を禁止**  
  Settings → Branches → "Do not allow bypassing the above settings" を ON。5分
- [ ] **6. 管理画面 Push 通知の実環境確認**  
  本番 VAPID キーで `notifyStore()` が届くか。新規注文受付通知が機能するか目視確認。30分
- [ ] **7. 生成値のバックアップ（暫定: 暗号化 sparsebundle + iCloud Drive）**  
  `SESSION_SECRET` / VAPID 3 値 / `CRON_SECRET` / Stripe・Supabase secret を二重バックアップ。`hdiutil create -encryption AES-256 -type SPARSEBUNDLE` で iCloud Drive に保存、パスフレーズは紙メモ + 物理金庫。30分。
- [ ] **7b. 1Password への移行（法人化を見据えて）**  
  法人化（〜1年後想定）のタイミングで Teams 版へ。それまでは #7 の暫定運用。CLI `op inject` で `.env.local` を git に置かず都度展開する運用も検討。
- [ ] **8. `README.md` の env 記述を最新化**  
  `.env.local.example` を一次情報にして `README.md` はそこへの参照に簡素化。15分
- [ ] **9. 顧客キャンセル機能の実装**  
  `paid` 状態の注文を顧客自身がキャンセル可能にする `POST /api/orders/[id]/cancel`（UUID をアクセストークン扱い）。半日
- [ ] **21. `.env.local` ノイズ変数の cleanup**  
  `NX_DAEMON` / `TURBO_*` / `VERCEL_*` / `VERCEL_OIDC_TOKEN` などが過去の `vercel env pull` 由来で混入。`.env.local.example` に無い変数を整理。15分
- [ ] **24. Stripe Webhook 冪等性レコード挿入順の修正（F-05）**  
  `processed_webhook_events` INSERT が処理前に行われ、処理失敗時に 200 を返して Stripe retry を止めてしまう。注文 pending 永久放置のリスク。修正案 A/B/C を提示してユーザー判断。テスト追加必須。1時間。

## 🟡 中期の機能拡張（Phase 2）

- [ ] **10. マイページ「準備中」3項目**  
  FAQ / プロフィール編集 / 支払い方法。FAQ は `local-main-2026-05-19` タグから cherry-pick 候補。FAQ: 1時間、他: 各半日〜1日
- [ ] **11. 顧客向けログイン機能**  
  Supabase Auth ベース。クロス端末で注文履歴を参照可能に。1〜2日
- [ ] **12. ADMIN_* dead code 削除**  
  `lib/env.ts` REQUIRED から `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_STORE_ID` を外し、`.env.local.example` も同期。15分
- [ ] **13. `next build` ローカルハング調査**  
  本番 build は健全、ローカルで `_not-found` collect 時にハング。Turbopack / Node 24.x 相性？ 半日
- [ ] **14. キュー補正の調整**  
  accepted 時に +3分/件で受取予想を後ろ倒し。実装の有無確認 + 精度改善。1時間（確認）+半日（改善）
- [ ] **15. 監視・アラート整備**  
  Sentry 導入、Webhook 失敗監視、cron 失敗監視。`lib/logger.ts` にも「将来 Sentry に差し替え」コメント。半日
- [ ] **16. E2E テストを CI で実行**  
  Playwright セットアップ済み。`.github/workflows/ci.yml` の `verify` ジョブで回しているか確認。1〜2時間

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
- `.env.local.example` — 必須環境変数と取得手順
- `lib/validation.ts` — 注文ステータス遷移定義
