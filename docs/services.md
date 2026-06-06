# mocal — 使用サービス一覧

> プロジェクトで使用している外部サービスの全体像。  
> アカウント管理・法人化・スタッフ追加時の引き継ぎ資料として使う。  
> 各サービスの認証情報は `.env.local` / Vercel Dashboard / iCloud Drive 暗号化 sparsebundle に保管。

---

## インフラ・ホスティング

### Vercel
- **用途**: Next.js アプリのホスティング（本番・プレビュー）
- **プラン**: Pro
- **ダッシュボード**: https://vercel.com/dtsukoshi-hues-projects/mocal
- **環境変数**: Vercel Dashboard → Settings → Environment Variables（Sensitive 変数は `vercel env pull` で取得不可・要手動コピー）
- **デプロイ**: `git push origin main` で自動デプロイ
- **関連ドキュメント**: `docs/deploy-runbook.md`

### Cloudflare
- **用途**: DNS 管理・Email Routing（`support@mocal.jp` → `d.tsukoshi@gmail.com` 転送）
- **プラン**: 無料
- **ネームサーバー**: `desi.ns.cloudflare.com` / `milan.ns.cloudflare.com`
- **設定済みレコード**: DKIM / SPF / DMARC（Resend 送信用）

### Xserver Domains
- **用途**: `mocal.jp` ドメイン取得元
- **移管先**: Cloudflare（DNS のみ・ドメイン登録は Xserver のまま）

### GitHub
- **用途**: ソースコード管理・CI（GitHub Actions）
- **リポジトリ**: `dtsukoshi-hue/mocal`（private）
- **CI**: `.github/workflows/ci.yml`（typecheck / lint / vitest / Playwright）
- **プラン**: 無料（個人）

---

## データベース・認証

### Supabase
- **用途**: PostgreSQL DB・匿名認証（Anonymous Sign-Ins）・Realtime（注文状況ページ）・RLS
- **プロジェクト**: 本番 1 プロジェクトのみ（staging は Phase 2 で追加予定 → backlog #59）
- **ダッシュボード**: https://supabase.com/dashboard
- **環境変数**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`（サーバーサイドのみ・RLS バイパス）
- **CLI**: `npx supabase ...`（dev dependency として `package.json` に pin）
- **注意**: `lib/database.types.ts` は手動管理（`supabase gen types` は使わない）

### Upstash Redis
- **用途**: レート制限（複数インスタンス間で共有）
- **プラン**: 無料枠
- **ダッシュボード**: https://upstash.com
- **環境変数**:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **備考**: 未設定時は in-memory フォールバック（単一インスタンスのみ有効）

---

## 決済

### Stripe
- **用途**: 決済処理・Connect Standard・Destination Charges + `on_behalf_of`（取次事業者モデル）
- **モード**: 本番（live mode）稼働中
- **ダッシュボード**: https://dashboard.stripe.com
- **本番アカウント**: Entrust合同会社（KYC 通過済）
- **Connect**: Destination Charges（店舗が merchant of record、mocal は 6.4% 手数料）
- **環境変数**:
  - `STRIPE_SECRET_KEY`（`sk_live_*`）
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（`pk_live_*`）
  - `STRIPE_WEBHOOK_SECRET`（`whsec_*`・本番 endpoint 用）
  - `STRIPE_CLIENT_ID`（Connect OAuth 用・`ca_*`）
- **Webhook endpoint**: `https://mocal.jp/api/webhook/stripe`
- **購読イベント**: `payment_intent.succeeded` / `payment_intent.payment_failed` / `charge.refunded`
- **関連ドキュメント**: `docs/payment-flow.md` / `docs/payment-design-legal.md`

---

## 通知・メール

### Resend
- **用途**: トランザクションメール（注文確認・準備完了・キャンセル・返金通知）
- **送信元**: `support@mocal.jp`
- **ダッシュボード**: https://resend.com
- **DNS 設定**: DKIM / SPF / DMARC（Cloudflare に設定済み）
- **環境変数**:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`（`support@mocal.jp`）
  - `INQUIRY_NOTIFICATION_EMAIL`（お問い合わせ通知先）
- **備考**: 未設定時はメール送信を無音スキップ（他機能に影響なし）

### Web Push（VAPID）
- **用途**: ブラウザプッシュ通知（店舗への新規注文通知・顧客へのステータス変更通知）
- **ライブラリ**: `web-push`（npm パッケージ）
- **Service Worker**: `public/sw.js`
- **環境変数**:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`（サーバーサイドのみ）
  - `VAPID_SUBJECT`（`mailto:support@mocal.jp`）
- **鍵生成**: `npx web-push generate-vapid-keys`

---

## 監視・運用

### Sentry
- **用途**: エラー監視・cron 死活監視（Cron Monitor）
- **プラン**: 無料枠
- **ダッシュボード**: https://sentry.io
- **Cron Monitor**: 3 ジョブ自動登録済み（`no-show` / `store-hours` / `cleanup-anonymous-users`）
- **環境変数**:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`
  - `SENTRY_AUTH_TOKEN`（source map upload 用・未設定でも動作可）
- **Alert ルール**: 新規 error issue → Email / Cron 失敗 → Email

### cron-job.org
- **用途**: cron ジョブのスケジューラ（Vercel は cron が Pro 制限のため暫定利用）
- **プラン**: 無料
- **ダッシュボード**: https://cron-job.org
- **登録済みジョブ**:

| ジョブ名 | URL | スケジュール |
|---|---|---|
| `mocal store-hours` | `https://mocal.jp/api/cron/store-hours` | 毎時 0 分（`0 * * * *`） |
| `mocal no-show` | `https://mocal.jp/api/cron/no-show` | 毎分（`* * * * *`） |
| `mocal cleanup-anon` | `https://mocal.jp/api/cron/cleanup-anonymous-users?dry=1` | 毎日 3:00 |

- **認証**: 各ジョブに `Authorization: Bearer <CRON_SECRET>` ヘッダー付与
- **環境変数**: `CRON_SECRET`
- **将来**: Pro 化後に `vercel.json` の `crons` へ移行予定
- **関連ドキュメント**: `docs/deploy-runbook.md` §9.1

---

## アカウント情報の保管場所

| 種別 | 保管場所 |
|---|---|
| 本番環境変数（全件） | Vercel Dashboard（Sensitive 設定済み） |
| ローカル開発用環境変数 | `.env.local`（gitignore 済み） |
| 再生成不可な秘密鍵 5 件 | iCloud Keychain「mocal - ローカル env 専用キー」 |
| 全 secret スナップショット | iCloud Drive `mocal-secrets.sparsebundle`（AES-256 暗号化） |

> 詳細な復旧手順は `AGENTS.md`「ローカル `.env.local` の復旧手順」を参照。

---

## 将来追加予定のサービス

| サービス | 用途 | 時期 |
|---|---|---|
| Supabase（staging project） | ローカル開発用 DB 分離 | Phase 2（backlog #59） |
| Cloudflare Turnstile | CAPTCHA（anonymous sign-in spam 防御） | pilot 完走後（backlog #33） |
| Twilio | SMS 通知 | Phase 2（backlog #19） |
| teppay | Suica / PASMO 決済 | Phase 3・2026 年秋以降（backlog #18） |
| 1Password Teams | secret 管理の一本化 | 法人化後（backlog #7b） |
