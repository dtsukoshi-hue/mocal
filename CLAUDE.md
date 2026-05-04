# mocal — CLAUDE.md（Claude Code 開発仕様書）

> このファイルは Claude Code が最初に読む仕様書です。
> プロジェクト全体の設計方針・技術スタック・実装ルールがすべてここに集約されています。
> 実装前に必ず全文を読んでください。

---

## 1. プロジェクト概要

**mocal**（モカル）は、公園・お出かけ先での食事をもっと気軽にするための、飲食店向けテイクアウト事前注文プラットフォームです。

- ユーザー手数料：**¥0**（完全無料）
- 店舗手数料：**mocal 6.4% + Stripe 3.6% = 合計 10.0%**
- ポスレジ不要・即日導入可能
- パイロット店舗：3000DAYS BURGER（清澄白河本店）

---

## 2. 事業者情報

| 項目 | 内容 |
|---|---|
| 会社名 | Entrust合同会社（設立準備中） |
| 代表者 | 津越 大輔 |
| 住所 | 未定（法人設立後に更新） |
| メール | support@mocal.jp（未定） |
| サービスURL | mocal.jp（予定） |

---

## 3. 技術スタック（確定）

| 領域 | 技術 | バージョン |
|---|---|---|
| フロントエンド | Next.js + TypeScript | Next.js 16.2.4 / React 19 |
| バックエンド/DB | Supabase（PostgreSQL + RLS + Realtime） | @supabase/ssr 0.10.x |
| 決済 | Stripe Connect（Direct Charges） | stripe 22.x / API 2026-03-25.dahlia |
| 通知 | WebPush（web-push + Service Worker） | web-push 3.6.x |
| ホスティング | Vercel（Pro プラン） | — |
| SMS認証 | 未実装（Phase 2） | — |
| スタイル | Tailwind CSS v4 | @tailwindcss/postcss |
| レート制限 | Upstash Redis（オプション）/ in-memory fallback | @upstash/ratelimit |
| DnD | @dnd-kit（メニュー並び替え） | 6.x / 10.x |
| テスト（unit） | Vitest 4.x + happy-dom | — |
| テスト（E2E） | Playwright 1.59.x | — |

---

## 4. デバイス対応（4ブレークポイント）

| デバイス | 画面幅 | 主な用途 |
|---|---|---|
| スマホ | 〜480px | ユーザー注文・外出先確認 |
| タブレット縦 | 481〜768px | iPad縦向き |
| タブレット横 | 769〜1024px | iPad横向き・Surface |
| PC | 1025px〜 | 管理画面メイン・オンボーディング |

---

## 5. 認証（実装済み）

### 5.1 店舗スタッフ認証（カスタム実装）

> ⚠️ Supabase Auth **ではない**。独自の `staff_accounts` テーブル + bcrypt + HMAC セッションクッキー。

- テーブル：`staff_accounts`（`store_id`, `email`, `password_hash`, `role`）
- パスワード：bcrypt（コスト 12）。`lib/staff-auth.ts` に `hashPassword` / `verifyPassword`
- セッション：HMAC-SHA256 署名の base64url トークン → `admin_session` httpOnly Cookie（7日）
- 実装：`lib/session.ts`（`createSessionToken` / `verifySessionToken` / `getSessionPayload`）
- `timingSafeEqual` でタイミング攻撃対策済み
- ログイン API：`/api/auth/login`（POST）

### 5.2 ユーザー（顧客）認証

- **ゲスト注文可能**（認証不要）
- SMS認証は未実装（Phase 2）
- ゲスト注文の照会：`order_id`（UUID）のみで識別（URL に含まれるため他人に推測されにくい）

---

## 6. ディレクトリ構造

```
mocal/
├── app/
│   ├── (admin)/admin/          # 店舗管理画面（Route Group）
│   │   ├── _components/        # AdminNav（共有ナビ）
│   │   ├── dashboard/          # 注文管理（アクティブ注文）
│   │   ├── history/            # 注文履歴
│   │   ├── hours/              # 営業時間設定
│   │   ├── login/              # 店舗ログイン
│   │   ├── menu/               # メニュー管理（コンボ含む）
│   │   ├── sales/              # 売上レポート・CSV出力
│   │   ├── settings/           # 店舗設定（画像・Stripe Connect）
│   │   └── staff/              # スタッフ管理
│   ├── (store)/                # 顧客向け画面（Route Group）
│   │   ├── [storeId]/          # 店舗ページ（メニュー・カート・決済）
│   │   ├── _components/        # CustomerBottomNav・StoreDiscoveryView
│   │   ├── mypage/             # マイページ（WebPush 管理）
│   │   ├── orders/             # 注文履歴・注文状況・領収書
│   │   ├── privacy/            # プライバシーポリシー
│   │   ├── terms/              # 利用規約
│   │   └── tokushoho/          # 特定商取引法
│   ├── actions/
│   │   ├── auth.ts             # Server Actions（ログイン・ログアウト）
│   │   └── orders.ts           # Server Actions（注文作成）
│   ├── api/
│   │   ├── admin/              # 管理系 API（menu, combos, staff, sales, store, stripe）
│   │   ├── auth/login/         # ログイン API
│   │   ├── health/             # ヘルスチェック
│   │   ├── orders/             # 注文取得・ステータス変更・プッシュ登録
│   │   ├── push/               # 店舗・顧客 WebPush 購読管理
│   │   └── webhook/stripe/     # Stripe Webhook 受信
│   ├── layout.tsx              # ルートレイアウト
│   ├── manifest.ts             # PWA マニフェスト
│   └── page.tsx                # トップページ（店舗ディスカバリー）
├── lib/
│   ├── database.types.ts       # 全テーブルの TypeScript 型（手動管理）
│   ├── env.ts                  # 必須環境変数の起動時一括検証
│   ├── logger.ts               # console ラッパー（JSON ログ）
│   ├── order-history.ts        # 注文履歴のローカルストレージ管理
│   ├── payment.ts              # Stripe PaymentIntent 作成ロジック
│   ├── push.ts                 # WebPush 送信（店舗・顧客向け）
│   ├── rate-limit.ts           # レート制限（Upstash Redis / in-memory）
│   ├── session.ts              # 管理画面セッション（HMAC Cookie）
│   ├── staff-auth.ts           # スタッフ認証（bcrypt）
│   ├── stripe.ts               # Stripe クライアントシングルトン
│   ├── supabase-server.ts      # Supabase service_role クライアント（サーバーのみ）
│   └── validation.ts           # 共通バリデーション関数
├── supabase/migrations/        # DB マイグレーション（時系列管理）
├── tests/
│   ├── __mocks__/              # server-only モジュールのスタブ
│   ├── actions/                # Server Actions ユニットテスト
│   ├── api/                    # API Route ユニットテスト
│   ├── dom/                    # DOM 依存ユニットテスト（happy-dom）
│   ├── e2e/                    # Playwright E2E テスト
│   ├── lib/                    # lib/* ユニットテスト
│   ├── proxy.test.ts
│   └── setup.ts                # Vitest グローバルセットアップ
├── public/sw.js                # Service Worker（WebPush 受信）
├── proxy.ts                    # 開発用プロキシ（Stripe Webhook 転送）
├── .env.local.example          # 環境変数テンプレート
├── vitest.config.ts
├── playwright.config.ts
└── next.config.ts              # セキュリティヘッダー（CSP / HSTS）設定済み
```

---

## 7. 注文ステータス設計

### 7.1 ステータス一覧
- **pending**：注文作成直後 / 決済中
- **paid**：決済成功（未受理）
- **accepted**：店舗受理
- **preparing**：調理中（MVP省略可）
- **ready**：受取可能
- **completed**：受取完了
- **cancelled**：キャンセル済（返金前）
- **refunded**：返金済
- **no_show**：未受取（ready から一定時間経過）

### 7.2 正常フロー
```
pending → paid（Webhook）→ accepted（店舗）
→ preparing（任意・MVP省略可）→ ready（店舗）→ completed（店舗 手動）
```

### 7.3 例外フロー
```
pending  → cancelled：決済失敗 / タイムアウト
paid     → cancelled → refunded：店舗都合 / サーバー判断
accepted → cancelled → refunded：在庫切れ / 営業時間外
ready    → no_show → completed（サーバー自動・10〜15分後）
```

> ⚠️ **`refunded` への直接遷移は禁止。必ず `cancelled` を経由する。**

### 7.4 権限制御

| 遷移 | 実行主体 |
|---|---|
| pending → paid | Webhook のみ |
| paid → accepted | 店舗 |
| accepted → preparing | 店舗 |
| preparing → ready | 店舗 |
| ready → completed | 店舗（手動） |
| ready → no_show | サーバー自動 |
| no_show → completed | サーバー自動 |
| 任意 → cancelled | 店舗（サーバー経由） |
| cancelled → refunded | サーバーのみ（自動） |

---

## 8. 決済フロー（Stripe Connect）

### 8.1 原則
- 決済確定は **Webhook のみ**
- フロントで成功判定禁止

### 8.2 フロー
1. 注文作成（`createOrderAction` Server Action）→ **在庫・営業時間チェック（1回目）**
2. チェック NG → 注文作成を拒否（決済前に弾く）
3. チェック OK → 注文作成（pending）+ PaymentIntent 作成（1注文1Intent）
4. ユーザー決済（Stripe Elements）
5. Webhook 受信（`/api/webhook/stripe`）→ **営業時間・金額チェック（2回目・保険）**
6. チェック OK → `paid` に更新・`stripe_charge_id`・`stripe_receipt_url` 保存
7. チェック NG → `cancelled`（自動返金は別途）

> ⚠️ チェックは二段構え。決済後に弾くと返金コストが発生するため、注文作成時に必ず1回目を行う。

### 8.3 Stripe 分配フロー
```
ユーザー支払い
  → Stripe（mocal プラットフォームアカウント）
  → 自動分配：店舗アカウントへ直接入金
  → mocal 収益：Application Fee（6.4%）
```

### 8.4 Webhook 仕様
エンドポイント：`/api/webhook/stripe/route.ts`

**署名検証（必須）**
```typescript
const rawBody = await request.arrayBuffer()
const bodyBuffer = Buffer.from(rawBody)  // JSON.parse 前の生データが必須
event = stripe.webhooks.constructEvent(bodyBuffer, sig, getEnv('STRIPE_WEBHOOK_SECRET'))
```
> ⚠️ `rawBody` は未パースの Buffer を使うこと。`JSON.parse` 後では署名検証が失敗する。

**処理するイベント**
- `payment_intent.succeeded` → `paid` に更新・Stripe レシート URL を保存・店舗へ Push 通知
- `payment_intent.payment_failed` → `cancelled`（`payment_failed`）
- `account.updated` → Stripe Connect オンボーディング状態のログ記録

### 8.5 冪等性
```sql
processed_webhook_events (stripe_event_id text PRIMARY KEY, processed_at timestamptz)
```
- `stripe_event_id` を INSERT（重複なら code=`23505` → スキップ）
- INSERT できた場合のみ後続処理を実行

### 8.6 Webhook 救済処理（cron）
- 注文作成から5分後、`pending` のままの注文を cron でチェック
- Stripe API で PaymentIntent の状態を再取得・補正

---

## 9. データベース設計（実装済みテーブル）

> 型定義は `lib/database.types.ts` で手動管理（`supabase gen types` は使わない）。
> `supabase-js v2` の型制約上 `interface` ではなく `type` を使用。

### 主要テーブル

```
stores              店舗マスタ
profiles            顧客プロファイル（auth.users と 1:1）
store_members       店舗メンバー（RLS 用。現在は service_role バイパスで代替）
staff_accounts      店舗スタッフ（カスタム認証用。auth.users とは別）
menu_items          メニュー商品
combo_offers        コンボ商品（お得なセット）
combo_offer_items   コンボに含まれる商品の内訳
orders              注文
order_items         注文明細（名前・価格はスナップショット）
store_hours         営業時間（曜日別）
push_subscriptions  店舗向け WebPush 購読情報
order_push_subs     顧客向け WebPush 購読情報（注文単位）
processed_webhook_events  Webhook 冪等性管理
```

### stores テーブル（実装済みカラム）
```
id, name, stripe_account_id, is_open, wait_minutes,
manual_override_until,   -- 手動営業/休業の期限（cron が上書きしない）
area,                    -- エリア（例: 清澄白河）ディスカバリー絞り込み用
cuisine_type,            -- 料理ジャンル（例: バーガー）
logo_url,                -- 店舗ロゴ画像 URL
cover_url,               -- 店舗カバー画像 URL
created_at
```

### orders テーブル（実装済みカラム）
```
id, order_number, store_id, user_id (nullable=ゲスト),
status, pickup_type, scheduled_at, total_amount,
estimated_ready_at, accepted_at, ready_at, no_show_at,
cancelled_reason_type, cancelled_reason_detail,
stripe_payment_intent_id, stripe_charge_id,
stripe_receipt_url,      -- Stripe 公式レシート URL（決済完了時に保存）
customer_note,           -- 顧客備考（200文字以内）
created_at
```

### order_items テーブル（実装済みカラム）
```
id, order_id, menu_item_id (nullable=削除商品),
name, price, qty,
combo_id,    -- コンボ商品の一部なら同じ combo_id を共有
combo_label  -- コンボ名スナップショット
```

### マイグレーションファイル一覧（`supabase/migrations/`）
```
20260423000000_initial_schema.sql        基本スキーマ
20260426000000_push_subscriptions_and_cron.sql   WebPush + cron
20260428000000_menu_image_url.sql        メニュー画像
20260428100000_order_notes.sql           顧客備考
20260429000000_staff_accounts.sql        スタッフ管理
20260430000000_user_push_subscriptions.sql   顧客向け Push
20260430010000_menu_description.sql      メニュー説明文
20260430020000_seed_menu_3000days.sql    シードデータ（3000DAYS BURGER）
20260430030000_store_hours.sql           営業時間テーブル
20260430040000_auto_open_close_cron.sql  営業時間自動開閉 cron
20260430050000_manual_override.sql       手動オーバーライド
20260430060000_store_area_cuisine.sql    エリア・ジャンル
20260430070000_combo_offers.sql          コンボ商品テーブル
20260501010000_order_items_combo.sql     注文明細にコンボ列追加
20260501020000_stripe_receipt_url.sql    レシート URL 列追加
20260501030000_store_images.sql          店舗画像列追加
```

---

## 10. 待ち時間ロジック

### 10.1 MVP：店舗手動設定
```
estimated_ready_at = accepted_at + wait_minutes（店舗設定値）
```
選択肢：10分 / 15分 / 20分 / 30分 / 40分 / 60分

> ⚠️ `estimated_ready_at` は `accepted` 時に確定する（注文作成時ではない）。

### 10.2 Phase 2：キュー補正
```
estimated_ready_at = accepted_at + wait_minutes + キュー補正
キュー補正 = 現在注文数 × 調整係数（例：3分）
現在注文数 = status IN ('accepted', 'preparing') の件数
```

### 10.3 延長時の挙動
- 店舗は手動で上書き可能
- 延長時はユーザーへ確認通知必須
- ユーザーが承諾しない場合 → キャンセル → 即時返金

---

## 11. no_show 対応

`ready` から **10〜15分** 経過した場合（運用後調整）：

```
ready → no_show（サーバー自動）→ completed（サーバー自動）
```

- ユーザーへ no_show 通知を送信
- 返金は行わない（受取可能状態だったため）
- `no_show_at` を記録し運用データとして活用

---

## 12. WebPush 通知（実装済み）

### 12.1 通知トリガー

| タイミング | 通知先 | 送信元 |
|---|---|---|
| paid | 店舗 | Webhook → `sendPushToStore` |
| accepted | ユーザー | `/api/orders/[id]` PATCH |
| ready | ユーザー | `/api/orders/[id]` PATCH |
| no_show | ユーザー | cron |
| cancelled → refunded | ユーザー | サーバー自動 |

### 12.2 実装詳細
- `lib/push.ts`：`sendPushToStore(storeId, payload)` / `sendPushToOrder(orderId, payload)`
- Service Worker：`public/sw.js`（push イベント受信・通知表示）
- VAPID 鍵：`npx web-push generate-vapid-keys` で生成
- 購読登録：`/api/push/subscribe`（店舗）、`/api/orders/[id]/push`（顧客）
- 410 Gone（無効サブスクリプション）は自動削除

### 12.3 チャネルロードマップ
- **MVP**：WebPush のみ
- **Phase 2**：SMS 追加（ゲスト注文ユーザー向けに強く推奨）

---

## 13. 店舗オペレーション

| 操作 | 遷移 |
|---|---|
| 受理ボタン | paid → accepted（`estimated_ready_at` 確定） |
| 調理開始ボタン | accepted → preparing（MVP省略可） |
| 準備完了ボタン | preparing（or accepted）→ ready（ユーザー通知） |
| 受取確認ボタン | ready → completed（手動） |
| キャンセルボタン | 任意 → cancelled → refunded（サーバー自動） |

---

## 14. キャンセル・返金ポリシー

- **ユーザーキャンセル**：原則不可。例外：店舗が受取時間を延長する場合、ユーザーが承諾しなければキャンセル→即時全額返金
- **店舗キャンセル**：保留（MVP後に決定）
- **返金処理**：Stripe Refunds API で即時処理 → WebPush通知 → `refunded` に更新

---

## 15. 決済手段ロードマップ

| フェーズ | 手段 | 方法 |
|---|---|---|
| MVP | Visa / Master / Amex / JCB | Stripe Connect |
| MVP | Apple Pay / Google Pay | Stripe Connect |
| Phase 2 | PayPay | PayPay for Business 別途契約 |
| Phase 2 | 楽天Pay | 楽天ペイ加盟店 別途契約 |
| Phase 3 | Suica / PASMO（teppay） | 2026年夏〜加盟店募集予定 |

---

## 16. セキュリティ設計

### 16.1 Supabase RLS 基本方針
- 現在の管理系 API はすべて **service_role クライアント（RLS バイパス）** を使用
- `createServiceClient()` は `lib/supabase-server.ts`（`server-only` インポート済み）
- `store_members` テーブルはあるが、現在の管理 API は Cookie セッションで認証を代替
- 顧客側は service_role で注文 INSERT（ゲスト用 RLS INSERT ポリシーが複雑なため）

### 16.2 ゲスト注文の照会保護
- 照会キー = `order_id`（UUID）。URL に含まれるため推測困難
- `/api/orders/lookup` は `order_id` + 電話番号（オプション）で照会
- レート制限：`checkRateLimitAsync('order-lookup', ip, 30, 60_000)`

### 16.3 API レート制限（実装済み）

| エンドポイント | 制限 | 実装 |
|---|---|---|
| `POST /api/orders`（createOrderAction） | 10回/分/IP | `checkRateLimitAsync` |
| `POST /api/auth/login` | 10回/分/IP | `checkRateLimitAsync` |
| `GET /api/orders/:id` | 30回/分/IP | `checkRateLimitAsync` |
| `POST /api/webhook/stripe` | 制限なし | — |

レート制限実装：`lib/rate-limit.ts`
- Upstash Redis が設定済みなら Redis ベース（サーバーレス複数インスタンス対応）
- 未設定なら in-memory フォールバック（単一インスタンスのみ有効）
- Redis 障害時は in-memory にフォールバック（fail-open しない）

### 16.4 セキュリティヘッダー（`next.config.ts` で設定済み）
- CSP（Stripe / Supabase / WebPush を許可）
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security（HSTS）
- Permissions-Policy（camera / microphone / geolocation を無効化）

### 16.5 その他
- `server-only` パッケージで Secret Key 類のフロントへの露出を防ぐ
- `STRIPE_WEBHOOK_SECRET` は本番・テスト環境で別々に設定
- タイミング攻撃対策：`timingSafeEqual` でセッション検証
- 存在しないスタッフのログイン試行にも bcrypt 計算時間を消費させる

---

## 17. エラー設計

| コード | 内容 | 対応 |
|---|---|---|
| E001 | 決済失敗 | ユーザーに再試行促す。`cancelled` に遷移 |
| E002 | 在庫切れ | 注文作成時に拒否 or Webhook 時にキャンセル→返金 |
| E003 | 店舗受付停止 | 注文作成時に拒否（フロント・API 両方で制御） |
| E004 | 通信エラー | リトライ。Webhook は冪等性で保護 |
| E005 | 金額不一致 | Webhook 処理中断・アラート発報・自動返金 |

---

## 18. 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# ユニットテスト（一回実行）
npm run test

# ユニットテスト（watch モード）
npm run test:watch

# テスト UI
npm run test:ui

# カバレッジ計測
npm run test:coverage

# E2E テスト（Playwright）
npm run test:e2e

# Lint
npm run lint
```

---

## 19. テスト方針

### 19.1 Vitest（ユニット・統合テスト）

- 設定：`vitest.config.ts`
- テスト置き場：`tests/` 配下（`tests/api/`, `tests/lib/`, `tests/actions/`）
- `server-only` モジュールは `tests/__mocks__/server-only.ts` で空モジュールに差し替え
- Supabase・Stripe などの外部サービスはすべてモック（vi.mock）
- カバレッジ対象：`lib/**`, `app/api/**`, `app/actions/**`
- カバレッジ除外：`_components/**`（UI は E2E 推奨）、`page.tsx`、`layout.tsx`

### 19.2 Playwright（E2E テスト）

- 設定：`playwright.config.ts`
- テスト置き場：`tests/e2e/`
- 主なテスト：`customer-flow.spec.ts`（顧客注文フロー）、`smoke.spec.ts`（スモーク）

---

## 20. 環境変数（`.env.local`）

テンプレート：`.env.local.example`

| 変数名 | 用途 | 必須 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role（サーバーのみ） | ✅ |
| `SESSION_SECRET` | セッション署名鍵（32byte hex） | ✅ |
| `ADMIN_EMAIL` | 初期管理者メール（環境変数ログイン） | ✅ |
| `ADMIN_PASSWORD` | 初期管理者パスワード | ✅ |
| `ADMIN_STORE_ID` | 初期管理者の店舗 UUID | ✅ |
| `STRIPE_SECRET_KEY` | Stripe 秘密鍵（サーバーのみ） | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 署名シークレット | ✅ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID 公開鍵（WebPush） | ✅ |
| `VAPID_PRIVATE_KEY` | VAPID 秘密鍵（サーバーのみ） | ✅ |
| `VAPID_SUBJECT` | VAPID Subject（mailto:） | ✅ |
| `NEXT_PUBLIC_APP_URL` | 公開 URL（Push 通知リンク先） | ✅ |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL（任意） | — |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis トークン（任意） | — |

> `lib/env.ts` の `requireEnv()` が起動時に全必須変数を一括検証する。未設定なら明確なエラーを throw。

---

## 21. 画面構成（実装状況）

### ユーザー側（PWA・Web）
| 画面 | パス | 状態 |
|---|---|---|
| 店舗ディスカバリー（TOP） | `/` | 実装済み |
| 店舗メニュー・カート・決済 | `/[storeId]` | 実装済み |
| 注文状況 | `/orders/[id]` | 実装済み |
| 領収書 | `/orders/[id]/receipt` | 実装済み |
| 注文履歴 | `/orders` | 実装済み |
| マイページ（WebPush 管理） | `/mypage` | 実装済み |
| プライバシーポリシー | `/privacy` | 実装済み |
| 利用規約 | `/terms` | 実装済み |
| 特定商取引法 | `/tokushoho` | 実装済み |
| SMS認証ログイン | — | 未実装（Phase 2） |

### 店舗管理画面（iPad / PC）
| 画面 | パス | 状態 |
|---|---|---|
| ログイン | `/admin/login` | 実装済み |
| 注文管理（ダッシュボード） | `/admin/dashboard` | 実装済み |
| 注文履歴 | `/admin/history` | 実装済み |
| メニュー管理（コンボ含む） | `/admin/menu` | 実装済み |
| 営業時間・受付設定 | `/admin/hours` | 実装済み |
| 売上レポート・CSV | `/admin/sales` | 実装済み |
| 店舗設定（画像・Stripe Connect） | `/admin/settings` | 実装済み |
| スタッフ管理 | `/admin/staff` | 実装済み |
| キャンセル・返金処理UI | — | 未実装 |

---

## 22. 設計原則

1. 決済確定は Webhook のみ
2. 返金は必ず `cancelled` を経由する
3. ステータスは単一責任で変更
4. Webhook は署名検証・冪等性・金額整合性の3点を必ず実装
5. 非同期処理前提で設計する
6. 店舗オペレーションを最優先に設計する
7. Secret Key 類はサーバーサイドのみ（`server-only` パッケージで強制）
8. 店舗判断に依存しすぎない（サーバー自動処理を活用）
9. 例外系を先に設計する
10. 放置データを作らない（no_show・cron による補正）

---

## 23. コーディング規約

- TypeScript strict モード
- コンポーネント命名：PascalCase
- ページ・Server Components：`page.tsx` / `layout.tsx`
- クライアントコンポーネント：`_components/` 配下・`'use client'` 明示
- Server Actions：`app/actions/` 配下・`'use server'` 明示
- API ルート：`app/api/` 以下に集約
- Supabase クライアント：`lib/supabase-server.ts`（`createServiceClient`）
- Stripe クライアント：`lib/stripe.ts`（サーバーサイドのみ）
- 環境変数アクセス：`getEnv()` を使う（直接 `process.env.X!` は禁止）
- 環境変数ファイル：`.env.local`（`.gitignore` に必ず追加）
- コメント：日本語 OK
- DB 型定義：`lib/database.types.ts` を手動管理（`supabase gen types` は使わない）

---

## 24. 未決事項

| 項目 | 現状 | 決定時期 |
|---|---|---|
| 住所・電話番号・メール | 法人設立後に更新 | 設立後 |
| no_show の時間 | 10〜15分（運用後調整） | 運用後 |
| 店舗都合キャンセルの責任範囲 | 保留 | MVP後 |
| `preparing` の有無 | MVP省略可として保留 | 実装開始前 |
| SMS 導入タイミング | Phase 2 以降 | 運用後 |
| キュー補正の係数 | Phase 2 で決定 | 運用データ取得後 |
| teppay 加盟店登録 | 2026年夏〜募集開始予定 | 募集開始後 |
| キャンセル・返金 UI | 未実装 | MVP後 |
