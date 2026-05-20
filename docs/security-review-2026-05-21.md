# mocal — セキュリティレビュー（2026-05-21 時点）

> Opus 直接 Read + grep 方式による全体監査の記録。
> 修正は実施せず、findings のみを列挙。
> 次回監査時はこのファイルとの差分で進捗を測る。

**対象**: commit `7f72bb5` 起点（直後 backlog 更新 commits を含む）
**監査者**: Opus 4.7
**方式**: 全 161 TS ファイル中、security 関連を直接 Read（agent 委託なし）
**修正**: なし（report のみ）

---

## サマリー

| 深刻度 | 件数 | 内訳 |
|---|---|---|
| 🔴 出荷ブロック級 | **3** | F-01 / F-02 / F-03 |
| 🟠 高 | **2** | F-05 / F-06 |
| 🟡 中 | **5** | F-04 / F-07 / F-08 / F-09 / F-10 |
| 🟢 低 | **7** | F-11 / F-12 / F-13 / F-14 / F-15 / F-16 / F-17 |
| ✅ 良好 | 12 項目 | 設計が原則通り |

---

## 🔴 出荷ブロック級

### F-01. Supabase migrations が空（過去事故 #4/#5 の根本原因が未解消）

- **場所**: `supabase/migrations/`（README のみ存在）
- **状況**: 旧 migrations は `.archive/supabase-migrations-legacy/` へ意図的に退避済み（実 DB と乖離していたため）。README に復旧手順あり
- **影響**: 実 DB の RLS / トリガー / 関数が repo に存在せず、コードレビュー不可。DB を再現できない（disaster recovery 不能）
- **推奨対応**: `supabase link` → `npm run db:pull` → `npm run types:gen`
- **関連**: AGENTS.md 事故 #4（store_hours 列名乖離）、#5（database.types.ts 手書き乖離）

### F-02. Next.js 16.2.4 に CSP nonce XSS 含む高深刻度脆弱性

- **`npm audit` 結果**: high 1（next）+ moderate 2（postcss / brace-expansion）
- **直撃する CVE**: **GHSA-ffhc-5mcf-pf4q**「Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces」← **mocal は CSP nonce 運用**
- **その他**: proxy bypass（GHSA-492v / GHSA-267c / GHSA-36qx）、cache poisoning、SSRF
- **推奨対応**: `npm install next@16.2.6`（patch update、semver 非破壊）
- **検証コマンド**: `npm audit` で 3 件 → 0 件

### F-03. 本番 cron エンドポイントが現在公開状態（経験的確認済み）

- **場所**: `app/api/cron/store-hours/route.ts:8-13` / `app/api/cron/no-show/route.ts:8-13`
- **コード**:
  ```ts
  const secret = process.env.CRON_SECRET
  if (secret) {  // ← CRON_SECRET 未設定なら認証スキップ
    if (auth !== `Bearer ${secret}`) return 401
  }
  ```
- **本番実証** (2026-05-20 時点):
  ```
  $ curl https://mocal-iota.vercel.app/api/cron/store-hours
  HTTP 200 {"ok":true,"dow":3,"time":"23:56",...}
  $ curl https://mocal-iota.vercel.app/api/cron/no-show
  HTTP 200 {"ok":true,"noShow":0}
  ```
- **悪用シナリオ**: `/api/cron/no-show` を連打すれば `ready` 注文を `no_show` に飛ばせる
- **対応中**: backlog #3、`CRON_SECRET` 生成済み、Vercel 登録待ち

---

## 🟠 高

### F-05. Stripe Webhook 冪等性レコード挿入順が不正

- **場所**: `app/api/webhook/stripe/route.ts:32-42, 173-176, 286`
- **問題**: `processed_webhook_events` INSERT を**処理前**に行い、処理失敗時に `console.error` + `break` → 関数末尾で `{ received: true }` (200) を返す
- **結果**: Stripe は 200 を受信 → retry しない → 注文は pending のまま永久放置
- **影響範囲**: DB 障害や Supabase ダウン中に Webhook が来た場合、決済済みなのに注文が放置される
- **推奨対応案**:
  - A) try/catch で全処理を囲み、失敗時に `processed_webhook_events` から DELETE + 500 返却（Stripe にリトライさせる）
  - B) INSERT を処理成功後に移動（ただし二重発火 race を別途対策）
  - C) PostgreSQL transaction で atomic 化

### F-06. `lib/env.ts` REQUIRED の不整合

- **場所**: `lib/env.ts:8-24`
- **不足**: `CRON_SECRET`（cron 認証で必須）
- **余剰**: `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_STORE_ID`（実コードから参照ゼロ、Supabase Auth 移行後の残骸）
- **副次効果**: `getEnv()` が遅延評価のため、push 通知が初めて発火するまで env チェックが走らない
- **推奨対応**: REQUIRED を整理（既存 backlog #12 ADMIN_* 削除と同時実施）

---

## 🟡 中

### F-04. Stripe OAuth state HMAC の `'dev-secret'` フォールバック

- **場所**: `app/api/onboarding/stripe/connect/route.ts:8` / `callback/route.ts:10`
- **コード**: `process.env.STRIPE_WEBHOOK_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'dev-secret'`
- **production リスク**: `STRIPE_WEBHOOK_SECRET` は Vercel env に設定済み → 通常は fallback 到達不能。ただし**設定ミス時のトラップ**として残存
- **設計問題**: Stripe Webhook secret を OAuth state HMAC キーに流用しているため、Webhook secret ローテーション時に in-flight OAuth が壊れる
- **推奨対応**: 専用 `CONNECT_STATE_SECRET` env への分離 + dev-secret 削除（throw に変更）

### F-07. CSV インジェクションの可能性

- **場所**: `app/api/admin/reports/export/route.ts:65-82`
- **問題**: `i.name`（メニュー名）が CSV にそのまま出力。値が `=` / `+` / `-` / `@` で始まると Excel/LibreOffice が**式として実行**
- **影響範囲**: 自店舗 CSV を見るのは自店舗スタッフのみ → 単独運用では実害ほぼゼロ。マルチテナント・スタッフ複数化で顕在化
- **推奨対応**: 危険文字始まりに `'`（アポストロフィ）または `\t` を前置

### F-08. CI lint が `continue-on-error: true`

- **場所**: `.github/workflows/ci.yml:36-38`
- **問題**: lint 失敗が merge を block しない
- **推奨対応**: `continue-on-error` 削除

### F-09. E2E テストが CI で実行されていない

- **場所**: `.github/workflows/ci.yml` に Playwright step なし
- **既知**: backlog #16
- **推奨対応**: `playwright install` + `npm run test:e2e` を追加

### F-10. ADMIN_* dead code

- **既知**: backlog #12
- **詳細**: F-06 と統合

---

## 🟢 低

### F-11. OAuth state に有効期限なし
- **場所**: `app/api/onboarding/stripe/callback/route.ts:8-24`
- **問題**: state に `iat` / `exp` なし → 捕獲した state を後日 replay 可能
- **推奨対応**: timestamp 追加 + 検証側で 10 分以内のみ受理

### F-12. logger に stack トレース全文
- **場所**: `lib/logger.ts:37-46`
- **問題**: `error_stack` がフルパス含む。Vercel ログ閲覧者次第でファイル構造が漏れる
- **推奨対応**: Sentry 移行時にスタブ化

### F-13. proxy.ts: request header CSP（不要）
- **場所**: `proxy.ts:121`
- **問題**: CSP は response 専用ヘッダー、request に設定する意味なし
- **推奨対応**: 当該行削除

### F-14. Branch Protection bypass 中
- **既知**: backlog #5
- **証跡**: push 時に `Bypassed rule violations for refs/heads/main: Required status check "verify" is expected`

### F-15. .env.local ノイズ変数
- **既知**: backlog #21
- **詳細**: `NX_DAEMON` / `TURBO_*` / `VERCEL_*` 等が `vercel env pull` 由来で混入

### F-16. reports/export コメント陳腐化
- **場所**: `app/api/admin/reports/export/route.ts:6`
- **問題**: 「カスタムセッション（admin_session クッキー）で認証」というコメントが Supabase Auth 移行後も残存
- **推奨対応**: コメント更新

### F-17. email の `orderStatusUrl` 未エスケープ
- **場所**: `lib/email.ts:50, 142`
- **問題**: `startsWith('http')` のみで HTML エスケープなし
- **脅威モデル**: `NEXT_PUBLIC_APP_URL` はサーバー側信頼 env のため実害低
- **推奨対応**: 念のため escapeHtml 適用

---

## ✅ 設計が原則通り良い箇所

| 項目 | 評価 |
|---|---|
| **CSP nonce + strict-dynamic** | per-request 生成、proxy.ts で response header 設定（CVE 修正後は安全） |
| **Rate limit** | Upstash Redis ↔ in-memory フォールバック、prefix で衝突防止 |
| **DAL (verifyStoreSession)** | React `cache()` で render 内重複排除 |
| **createOrderAction** | サーバー側で価格・名前を再計算（フロント値を信用しない） |
| **Stripe Webhook 署名検証** | rawBody (`arrayBuffer`) で正しく検証 |
| **Webhook 冪等性テーブル** | `processed_webhook_events(stripe_event_id PK)`（順序問題は F-05 として個別対応）|
| **status 遷移検証** | `lib/validation.ts` で一元管理 |
| **画像アップロード** | MIME allow-list + size 5MB + `{storeId}/{itemId}.{ext}` 固定パス |
| **store_id スコープ** | 全 admin write で session.storeId 固定、cross-tenant 不可 |
| **HMAC timing-safe 比較** | OAuth state 検証で正しく実装 |
| **Order UUID = bearer token** | 122bit、`/api/orders/lookup` で UUID 厳格検証 + max 20 件 + rate limit |
| **onboarding rollback** | 失敗時に user / store を逆順削除（孤立データなし）|

---

## 関連バックログ

- 🔴 #3 — F-03 (cron 認証) 着手中
- 🔴 #22 — F-02 (Next.js upgrade) 追加予定
- 🔴 #23 — F-01 (migrations 取り込み) 追加予定
- 🟠 #24 — F-05 (Webhook 冪等性) 追加予定
- 🟡 #5 #8 #12 #16 #21 — 既存
- F-04 / F-07 / F-11〜F-17 — Phase 4 開始時に backlog 化

---

## 次回監査時の差分の取り方

このファイルとの差分で進捗を測る:
- finding ID が backlog に紐付き、commit 内で `[x]` 化されているか
- 新規 finding が同じカテゴリで再発していないか
- ✅ 良好項目が劣化していないか
