# mocal — テイクアウト事前注文プラットフォーム

mocal は飲食店のテイクアウト事前注文 / 決済導線を提供する**取次事業者**であり、商品（食品）の販売者ではありません。各商品の販売者は、mocal を通じて出店している各店舗です。法的整理 / 決済モデルの詳細は [`docs/payment-design-legal.md`](docs/payment-design-legal.md) を参照。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router, Turbopack)
- **DB / 認証**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **決済**: Stripe Connect Standard + Destination Charges + `on_behalf_of`（取次事業者モデル、各店舗が merchant of record）
- **メール**: Resend
- **プッシュ通知**: Web Push (VAPID)
- **スタイリング**: Tailwind CSS v4

---

## 開発者向け — まず読むもの

新規参加 / セッション再開時は以下を必ず確認:

| ファイル | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 運用ルール（過去事故と再発防止、ブランチ運用、DB スキーマ、RLS の罠、決済 / 法的整合性に関わる変更の手順、push 前のチェック等） |
| [`docs/backlog.md`](docs/backlog.md) | 残作業の単一の真実（着手前に必ず確認、`[~]` 化してから実装） |
| [`docs/payment-design-legal.md`](docs/payment-design-legal.md) | 決済設計の法的整合性（資金決済法 §37 / 取次事業者モデル / 5 重防御 L1–L6） |
| [`docs/payment-flow.md`](docs/payment-flow.md) | 決済フロー 3 枚（A: Happy Path / B: 失敗・返金 / C: 法的当事者 + 5 重防御） |
| [`docs/customer-auth-design.md`](docs/customer-auth-design.md) | 顧客認証（Supabase Anonymous Sign-Ins ベース） |
| [`docs/workflow.md`](docs/workflow.md) | アーキテクチャ全体図 |
| [`docs/deploy-runbook.md`](docs/deploy-runbook.md) | デプロイ手順 + 初回セットアップ |

---

## ローカル開発セットアップ

### 1. 環境変数

**一次情報は [`.env.local.example`](.env.local.example) を参照**。必須変数とオプション変数、各変数のコメントがそこに集約されている。

```bash
cp .env.local.example .env.local
# Vercel Dashboard から値をコピーして埋める
# https://vercel.com/dtsukoshi-hues-projects/mocal/settings/environment-variables
```

> **注意**: Vercel の Sensitive 環境変数は `vercel env pull` では空文字で返るため Dashboard から手動コピーが必要。詳細は [`AGENTS.md`](AGENTS.md) 「ローカル `.env.local` の復旧手順」参照。

**新規生成が必要な値** (Vercel Dashboard には未登録 / ローカル生成で OK):

| 変数 | 生成コマンド |
|---|---|
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `VAPID_*` 3 値 | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | `openssl rand -hex 32` |

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

要点のみ（詳細フロー / 失敗 / 返金 / 法的当事者は [`docs/payment-flow.md`](docs/payment-flow.md) 図 A/B/C 参照）:

```
顧客: 店舗ページ（/[slug]）→ カート → 決済（Stripe Elements）
                                          ↓
Stripe Connect: Platform Account で PaymentIntent 作成
                  ├─ transfer_data.destination = 店舗 Connect account（売上計上）
                  ├─ on_behalf_of = 店舗 Connect account（merchant of record を店舗に）
                  └─ application_fee_amount = mocal の取次手数料（6.4%）
                                          ↓
Webhook payment_intent.succeeded → 注文ステータス: paid → 店舗に Push 通知
                                          ↓
店舗管理者: 注文受理 → 調理中 → 準備完了
                                          ↓
顧客: Push通知 + メール（準備完了 / キャンセル / 返金）
```

決済関連コード / Webhook / 返金経路を変更する場合は、AGENTS.md §「決済 / 法的整合性に関わる変更」のルール（payment-flow.md を先に更新 → user 合意 → 実装）に従ってください。

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

Vercel へのデプロイ時は [`.env.local.example`](.env.local.example) の全変数を Vercel の Environment Variables に設定してください。  
`STRIPE_WEBHOOK_SECRET` は Vercel のエンドポイント URL で Stripe ダッシュボードに登録してください。

詳細手順は [`docs/deploy-runbook.md`](docs/deploy-runbook.md) を参照。
