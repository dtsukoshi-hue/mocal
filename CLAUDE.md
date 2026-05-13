# mocal — CLAUDE.md

> **Claude Code / AI エージェント向け仕様書。セッション冒頭に必ず全文を読むこと。**
> 前半（§1〜§13）= **現在のコードベースの実態**。後半（§14〜）= 設計ドキュメント（将来フェーズの参考）。

---

## §1. プロジェクト概要

**mocal**（モカル）— 飲食店向けテイクアウト事前注文プラットフォーム。

- 顧客がモバイルブラウザで注文 → Stripe 決済 → 店舗ダッシュボードで受付・調理 → 準備完了を Push 通知 → 受取番号で受け取り
- 店舗手数料：mocal 6.4% + Stripe 3.6% = **合計 10%**
- パイロット店舗：3000DAYS BURGER（清澄白河本店）
- 事業者：Entrust 合同会社（設立準備中）/ 代表：津越 大輔

---

## §2. 技術スタック（実装済み）

| 領域 | 技術 |
|---|---|
| フレームワーク | **Next.js App Router**（このバージョン固有の注意は §3 参照） |
| DB / Realtime | **Supabase**（PostgreSQL + RLS + Realtime） |
| 決済 | **Stripe Connect — Destination Charges**（Direct Charges ではない） |
| Push 通知 | **WebPush**（web-push パッケージ + VAPID） |
| ホスティング | Vercel |
| スタイル | Tailwind CSS |
| テスト | Vitest（ユニット）+ Playwright（E2E） |
| レートリミット | Upstash Redis（未設定時 in-memory フォールバック） |

---

## §3. このバージョンの Next.js 固有事項

> ⚠️ **訓練データの Next.js と API・規約・ファイル構造が異なる。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読むこと。**

| 項目 | このバージョンの挙動 |
|---|---|
| middleware ファイル名 | **`proxy.ts`**（`middleware.ts` ではない） |
| middleware の export 名 | **named export `proxy`**（`default` ではない） |
| ルート matcher | `proxy.ts` の末尾 `export const config = { matcher: [...] }` |
| CSP nonce | `proxy.ts` の `buildCsp()` で per-request 生成。`x-nonce` ヘッダーで Server Components へ渡す |
| 静的セキュリティヘッダー | `next.config.ts` の `headers()` で設定（CSP 以外） |

---

## §4. 開発コマンド

```bash
npm run dev           # 開発サーバー起動
npx tsc --noEmit      # 型チェック ← コード変更後は必ず実行
npx vitest run        # ユニットテスト（350件・全パスが前提）
npx vitest run --reporter=verbose  # テスト詳細表示
```

---

## §5. ディレクトリ構造（重要部分）

```
app/
  (admin)/admin/         管理画面（admin_session クッキーで認証）
    dashboard/           注文管理ダッシュボード
    menu/                メニュー管理
    hours/               営業時間設定
    history/             注文履歴
    sales/               売上レポート
    settings/            店舗設定・Stripe Connect・画像
    staff/               スタッフ管理（owner のみ）
    login/               ログイン
  (store)/               顧客向け（認証なし）
    [storeId]/           店舗メニューページ・カート・決済
    orders/[id]/         注文ステータス・顧客 Push 通知登録
    orders/[id]/receipt/ 領収書
    orders/              注文履歴（localStorage ベース）
    mypage/              マイページ・通知設定
  api/
    admin/               管理 API（認証必須）
    orders/[id]/         注文取得・ステータス更新・Push 登録
    push/                Push 購読管理
    webhook/stripe/      Stripe Webhook
    auth/login/          ログイン API
    health/              ヘルスチェック
  actions/               Server Actions（auth.ts, orders.ts）

lib/
  session.ts             セッショントークン（HMAC-SHA256 + base64url）
  staff-auth.ts          スタッフ認証（bcrypt）
  push.ts                WebPush 送信
  payment.ts             Stripe 決済抽象化
  validation.ts          注文ステータス遷移検証
  rate-limit.ts          レートリミット（Upstash Redis / in-memory）
  env.ts                 必須環境変数の起動時検証
  order-history.ts       顧客側 localStorage 注文履歴
  supabase-server.ts     service_role クライアント
  database.types.ts      Supabase 自動生成型

proxy.ts                 Next.js middleware（CSP nonce・レートリミット・管理認証）
next.config.ts           静的セキュリティヘッダー
public/sw.js             Service Worker（Push 通知受信・タップ時フォーカス）
supabase/migrations/     DB マイグレーション
tests/
  api/                   API ルートのユニットテスト
  lib/                   lib/ のユニットテスト
  dom/                   DOM テスト（jsdom）
  e2e/                   Playwright E2E
```

---

## §6. アーキテクチャの重要ルール

1. **注文 UUID = アクセストークン**  
   顧客認証は不要。注文 ID（UUID, 122bit）を URL で知っている人だけがアクセス可能。

2. **ゲスト注文は service_role で取得**  
   顧客向けの注文取得に RLS SELECT ポリシーがない。`createServiceClient()` を使うこと。  
   anon key でのクエリは Realtime 購読のみ。

3. **管理認証は二重検証**  
   - `proxy.ts`：楽観チェック（Edge で高速処理）
   - 各ページ/API：`verifySessionToken()` で再検証（DAL 原則）

4. **Stripe Webhook が注文確定の唯一の権威**  
   フロントの決済結果で status を変更してはいけない。

5. **Webhook べき等性は `processed_webhook_events` テーブルで担保**  
   `stripe_event_id` を INSERT して成功した場合のみ後続処理を実行。

6. **コンボアイテムは必ず集約表示**  
   `order_items` の `combo_id` / `combo_label` で紐づくアイテムは、  
   `buildOrderRows()`（OrderStatusView / ReceiptView）または同等のロジックで1行に集約する。  
   バラバラに表示しない。

7. **ステータス遷移は `validation.ts` で一元管理**  
   ```typescript
   // lib/validation.ts
   export const VALID_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
     paid:      ['accepted', 'cancelled'],
     accepted:  ['preparing', 'ready', 'cancelled'],
     preparing: ['ready', 'cancelled'],
     ready:     ['completed', 'no_show'],
   }
   ```
   遷移前に必ず `isValidOrderStatusTransition(from, to)` で検証する。

8. **`refunded` への直接遷移は禁止**  
   必ず `cancelled` → `refunded` の順で遷移する。

---

## §7. 認証・セキュリティの実装パターン

### 管理者セッション
```typescript
// lib/session.ts — JWTではなく独自 HMAC-SHA256 署名
// トークン形式: base64url(payload).hex(HMAC-SHA256)
// 有効期限: 7日

await setSession({ email, storeId, role: 'owner' | 'staff' })
const session = verifySessionToken(token)  // null = 無効/期限切れ
```

### スタッフ認証
```typescript
// lib/staff-auth.ts — bcrypt ハッシュ
// staff_accounts テーブルに保存（password_hash）
const staff = await authenticateStaff(email, password)
```

### レートリミット
```typescript
// lib/rate-limit.ts
// Upstash Redis があれば分散対応、なければ in-memory（per-instance）
await checkRateLimitAsync('login-api', ip, 5, 60_000)  // 5回/分
checkRateLimit(key, max, windowMs)  // 同期版（Edge以外）
```

### CSP nonce（proxy.ts）
```typescript
// per-request で nonce 生成 → x-nonce ヘッダーで Server Components へ
// script-src: 'nonce-{nonce}' 'strict-dynamic' https://js.stripe.com
// style-src: 'unsafe-inline'（Stripe Payment Element がインラインスタイル注入）
```

### セキュリティヘッダー（next.config.ts）
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## §8. データモデルの要点（実装済みスキーマ）

### 主要テーブル

```
stores
  is_open, wait_minutes
  manual_override_until  ← 手動で営業オン/オフした場合のタイムスタンプ（当日終了まで）
  area, cuisine_type     ← 絞り込みフィルター用
  logo_url, cover_url    ← Supabase Storage

orders
  id (UUID), order_number (int), store_id, status
  total_amount, estimated_ready_at, accepted_at, ready_at
  stripe_payment_intent_id, stripe_charge_id, stripe_receipt_url
  customer_note, pickup_type ('standard' | 'scheduled'), scheduled_at

order_items
  order_id, name, price, qty
  combo_id       ← NULLでなければコンボの一部（同じcombo_idでグループ化）
  combo_label    ← コンボの表示名

combo_offers / combo_offer_items
  ← セット商品の定義。注文時に個別アイテムに展開されてorder_itemsへ

push_subscriptions          ← 管理者向け Push（store_id 紐付け）
order_push_subscriptions    ← 顧客向け Push（order_id 紐付け）

staff_accounts              ← スタッフ（email, password_hash by bcrypt, role）
processed_webhook_events    ← Webhook べき等性（stripe_event_id PK）
menu_items                  ← sort_order で並び順管理
store_hours                 ← 曜日別営業時間（自動開閉 cron が参照）
```

---

## §9. Push 通知の実装

### 管理者向け（新規注文通知）
```
/api/push/subscribe (POST)  → push_subscriptions に保存
新規注文時                  → lib/push.ts の sendPushToStore(storeId, payload)
```

### 顧客向け（準備完了通知）
```
/api/orders/[id]/push (POST) → order_push_subscriptions に保存
ready ステータス時            → lib/push.ts の sendPushToOrder(orderId, payload)
```

### Service Worker（public/sw.js）
- `push` イベント: `showNotification()` で通知表示（`requireInteraction: true`）
- `notificationclick`: 既存タブがあれば `focus()`、なければ `openWindow()`

### マウント時の購読チェック（重要）
```typescript
// PushSubscriber.tsx / CustomerPushSubscriber.tsx の両方で実装済み
// マウント時に navigator.serviceWorker.getRegistration() → getSubscription() を確認し
// 購読済みなら "通知を許可する" UI を出さない（リロード後に再表示しない）
```

### 期限切れエンドポイントの自動削除
```typescript
// lib/push.ts sendBatch() 内
// 410 Gone が返ったエンドポイントは DB から自動削除
```

---

## §10. 注文フロー（実装済みの全体像）

```
顧客: メニュー選択 → カート → Server Action (createOrder) → Stripe PaymentIntent 生成
  ↓
顧客: Stripe Elements で決済
  ↓
Webhook (/api/webhook/stripe): payment_intent.succeeded → status = 'paid'
  ↓
Realtime / 20秒ポーリング: 顧客側 OrderStatusView が自動更新
管理: PushSubscriber で新規注文通知 → ダッシュボードで受付
  ↓
管理: 受付ボタン → PATCH /api/orders/[id] → status = 'accepted'（estimated_ready_at 確定）
管理: 調理開始 / 準備完了 → PATCH /api/orders/[id] → status = 'preparing' / 'ready'
顧客: CustomerPushSubscriber の通知 or ポーリングで 'ready' を検知
  ↓
管理: 受取確認 → status = 'completed'
顧客: 領収書 (/orders/[id]/receipt) を表示
```

---

## §11. テスト戦略

```
tests/api/        APIルートのユニットテスト（fetchモック）
tests/lib/        lib/ のユニットテスト
tests/dom/        jsdom 環境（order-history.ts の localStorage テスト）
tests/e2e/        Playwright（実サーバー必要・smoke + customer-flow）
```

### テスト実行
```bash
npx vitest run           # 全ユニットテスト（350件）
npx tsc --noEmit         # 型チェック
```

### カバレッジ除外対象
UIコンポーネント（`_components/`）は vitest 対象外。E2E でカバー。

---

## §12. UI の制約

> **ださいUIは絶対にやめること。**

### ブランドカラー
| 用途 | クラス |
|---|---|
| ブランド（ボタン・アクセント） | `amber-700` / `amber-600` |
| 完了・成功 | `emerald-600` / `emerald-500` |
| エラー | `red-500` / `red-600` |
| ニュートラル | `gray-900` / `gray-500` |
| 背景 | `stone-50` |

### 形状
- カード：`rounded-2xl shadow-sm border border-gray-100`
- ボタン：`rounded-xl`（大）/ `rounded-full`（ピル型）

### アクセシビリティ
- 動的エラーメッセージには必ず `role="alert"` を付ける
- ページには `<main id="main-content">` を必ず置く（スキップリンク対応）
- 管理ロゴのサイズ：`text-lg font-black`（受付中ボタンとバランスを取る）

---

## §13. よくある落とし穴

1. **`combo_id` / `combo_label` を SELECT に含め忘れる**  
   `order_items` を SELECT するクエリには `combo_id, combo_label` を必ず含める。  
   忘れると OrderStatusView / ReceiptView / OrderCard でアイテムがバラバラ表示になる。

2. **Push 購読後リロードで「通知を許可する」が再表示される**  
   マウント時に `getRegistration()` → `getSubscription()` を確認するコードが必要。  
   `PushSubscriber.tsx` と `CustomerPushSubscriber.tsx` の実装を参照。

3. **`manifest.webmanifest` の `name` と `short_name` の混同**  
   - `name` = `'mocal — テイクアウト事前注文'`  
   - `short_name` = `'mocal'`  
   E2E テストでは `short_name` を検証すること。

4. **このバージョンの middleware は `proxy.ts`**  
   `middleware.ts` というファイルは存在しない。`proxy.ts` が `export async function proxy` で middleware として機能する。

5. **管理ページで `force-dynamic` を忘れる**  
   `cookies()` を使うページはビルド時にキャッシュされない。`export const dynamic = 'force-dynamic'` を先頭に書く。

6. **Stripe 返金は `cancelled` を経由する**  
   `refunded` に直接遷移させない。`payment.ts` の `refundPayment()` は `cancelled` 後に呼ぶ。

7. **ゲスト注文の取得に anon key を使う**  
   顧客向け注文ページでは `createServiceClient()` を使う。anon クライアントでは RLS で弾かれる。

8. **`validated.ts` の `isValidOrderStatusTransition()` をスキップする**  
   PATCH /api/orders/[id] での status 更新前に必ず遷移検証を行う。

---

---

# 以下：設計ドキュメント（将来フェーズの参考）

> 以下は実装前に作成した設計書です。現在の実装と異なる部分があります（例：SMS認証は未実装、Supabase Auth は未使用）。**コーディング時は上の §1〜§13 を優先すること。**

---

## 14. 注文ステータス設計（設計書）

### 14.1 ステータス一覧
- **pending**：注文作成直後 / 決済中
- **paid**：決済成功（未受理）
- **accepted**：店舗受理
- **preparing**：調理中（MVP省略可）
- **ready**：受取可能
- **completed**：受取完了
- **cancelled**：キャンセル済（返金前）
- **refunded**：返金済
- **no_show**：未受取（ready から一定時間経過）

### 14.2 正常フロー
```
pending → paid（Webhook）→ accepted（店舗）
→ preparing（任意・MVP省略可）→ ready（店舗）→ completed（店舗 手動）
```

### 14.3 例外フロー
```
pending  → cancelled：決済失敗 / タイムアウト
paid     → cancelled → refunded：店舗都合 / サーバー判断
accepted → cancelled → refunded：在庫切れ / 営業時間外
ready    → no_show → completed（サーバー自動・10〜15分後）
```

---

## 15. 決済フロー（設計書）

### 15.1 フロー
1. 注文作成 API → **在庫・営業時間チェック（1回目）**
2. チェック NG → 注文作成を拒否（決済前に弾く）
3. チェック OK → 注文作成（pending）+ PaymentIntent 作成（1注文1Intent）
4. ユーザー決済
5. Webhook 受信 → **在庫・営業時間・金額チェック（2回目・保険）**
6. チェック OK → `paid` に更新
7. チェック NG → `cancelled` → `refunded`（自動）

### 15.2 Stripe 分配フロー
```
ユーザー支払い
  → Stripe（mocal プラットフォームアカウント）
  → 自動分配：店舗アカウントへ直接入金（Destination Charges）
  → mocal 収益：Application Fee（6.4%）
```

---

## 16. 待ち時間ロジック（設計書）

### 16.1 MVP：店舗手動設定
```
estimated_ready_at = accepted_at + wait_minutes（店舗設定値）
```
選択肢：10分 / 15分 / 20分 / 30分 / 40分 / 60分

> ⚠️ `estimated_ready_at` は `accepted` 時に確定する（注文作成時ではない）。

### 16.2 Phase 2：キュー補正
```
estimated_ready_at = accepted_at + wait_minutes + キュー補正
キュー補正 = 現在注文数 × 調整係数（例：3分）
現在注文数 = status IN ('accepted', 'preparing') の件数
```

---

## 17. 開発フェーズロードマップ

### Phase 1 — MVP（実装済み）
- Supabase スキーマ・RLS
- 注文フロー（フロント → DB → Realtime）
- Stripe Connect 決済（Destination Charges）
- WebPush 通知
- 店舗管理画面

### Phase 2 — 運用品質
- キャンセル・返金 UI
- レシート印刷連携（AirPrint）
- 店舗オンボーディングフロー
- PayPay・楽天Pay 対応
- キュー補正・待ち時間の自動化
- SMS 通知（Twilio）

### Phase 3 — 成長
- LP 公開・SEO
- teppay（Suica/PASMO）対応（2026年秋以降）
- プロプラン（複数店舗・スタッフ管理）

---

## 18. 未決事項

| 項目 | 現状 | 決定時期 |
|---|---|---|
| 住所・電話番号 | 法人設立後に更新 | 設立後 |
| no_show の時間 | 10〜15分（運用後調整） | 運用後 |
| 店舗都合キャンセルの責任範囲 | 保留 | MVP後 |
| SMS 導入タイミング | Phase 2 以降 | 運用後 |
| キュー補正の係数 | Phase 2 で決定 | 運用データ取得後 |
| teppay 加盟店登録 | 2026年夏〜募集開始予定 | 募集開始後 |

---

## 19. 設計原則

1. 決済確定は Webhook のみ
2. 返金は必ず `cancelled` を経由する
3. Webhook は署名検証・冪等性・金額整合性の3点を必ず実装
4. Secret Key 類はサーバーサイドのみ（`server-only` でフロント露出を防ぐ）
5. 例外系を先に設計する
6. 放置データを作らない（no_show・cron による補正）
