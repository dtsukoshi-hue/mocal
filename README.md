# mocal — テイクアウト事前注文プラットフォーム

飲食店のテイクアウト注文を事前予約・決済できる B2B SaaS プラットフォームです。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router, Turbopack)
- **DB / 認証**: Supabase (PostgreSQL + Auth + Realtime)
- **決済**: Stripe (Connect, PaymentIntent)
- **メール**: Resend
- **プッシュ通知**: Web Push (VAPID)
- **スタイリング**: Tailwind CSS v4

---

## ローカル開発セットアップ

### 1. 環境変数

`.env.local` に以下を設定してください：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx   # Stripe CLI で生成

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxxx
VAPID_PRIVATE_KEY=xxxx
VAPID_SUBJECT=mailto:your@email.com

# メール (Resend) — 省略可（なければメール送信をスキップ）
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=mocal <noreply@mocal.jp>

# アプリ URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 管理者
ADMIN_EMAIL=your@email.com
ADMIN_STORE_ID=your_store_uuid
```

#### VAPID キーの生成

```bash
npx web-push generate-vapid-keys
```

### 2. 開発サーバー起動

```bash
npm install
npm run dev
```

### 3. Stripe Webhook のローカル転送

別ターミナルで Stripe CLI を起動して webhook をローカルに転送します：

```bash
# ログイン（初回のみ）
stripe login

# webhook を localhost に転送
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

出力される `whsec_xxx` を `.env.local` の `STRIPE_WEBHOOK_SECRET` に設定してください。

> **注意**: `stripe listen` を起動した状態で決済テストを行ってください。  
> Webhook が届かないと注文ステータスが `paid` に更新されません。

### 4. テスト用カード番号（Stripe テストモード）

| カード番号 | 結果 |
|---|---|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 9995` | 残高不足エラー |
| `4000 0025 0000 3155` | 3DS 認証が必要 |

有効期限: 将来の日付（例: 12/34）、CVC: 任意の3桁

---

## テスト

```bash
# ユニットテスト (Vitest)
npm run test

# E2E テスト (Playwright) — dev server を起動した状態で実行
npm run test:e2e

# 特定の店舗スラッグを使用してテスト（省略時は自動 seed）
PLAYWRIGHT_TEST_STORE_SLUG=my-store npx playwright test store-order-flow
```

E2E テストは `globalSetup` で自動的にテスト用店舗を Supabase に作成し、  
`globalTeardown` で削除します。`SUPABASE_SERVICE_ROLE_KEY` が必要です。

---

## 注文フロー

```
顧客: メニュー → カート → 決済（Stripe Elements）
                            ↓
Stripe Webhook: payment_intent.succeeded
                            ↓
                注文ステータス: paid
                メール: 注文確認メール送信
                Push: 店舗スタッフに通知
                            ↓
管理者: 注文受理 → 調理中 → 準備完了
                            ↓
顧客: Push通知 + メール（準備完了 / キャンセル / 返金）
```

---

## メール通知（Resend）

`RESEND_API_KEY` を設定すると以下のメールが送信されます：

| タイミング | テンプレート |
|---|---|
| 決済完了 | 注文確認メール（`sendOrderConfirmEmail`） |
| 準備完了 | 受取案内メール（`sendOrderStatusEmail` status=ready） |
| キャンセル | キャンセル通知（status=cancelled） |
| 返金完了 | 返金完了通知（status=refunded） |

キーが未設定の場合はメール送信をスキップして他の動作は継続します。

---

## プッシュ通知（Web Push）

店舗スタッフは `/admin/dashboard` で通知を許可すると、新規注文時に Push 通知を受け取れます。  
顧客は注文状況ページで通知を購読すると、ステータス変更時に通知を受け取れます。

HTTPS またはローカルホスト（localhost）での動作が必要です。

---

## デプロイ

Vercel へのデプロイ時は上記の環境変数を Vercel の Environment Variables に設定してください。  
`STRIPE_WEBHOOK_SECRET` は Vercel のエンドポイント URL で Stripe ダッシュボードに登録してください。
