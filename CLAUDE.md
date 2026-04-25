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

| 領域 | 技術 |
|---|---|
| フロントエンド | Next.js + TypeScript |
| バックエンド/DB | Supabase（PostgreSQL + RLS + Realtime + Auth + Edge Functions） |
| 決済 | Stripe Connect（Direct Charges） |
| 通知 | WebPush（Supabase + サービスワーカー） |
| ホスティング | Vercel（Pro プラン） |
| SMS認証 | Supabase Auth + Twilio |
| スタイル | Tailwind CSS |

---

## 4. デバイス対応（4ブレークポイント）

| デバイス | 画面幅 | 主な用途 |
|---|---|---|
| スマホ | 〜480px | ユーザー注文・外出先確認 |
| タブレット縦 | 481〜768px | iPad縦向き |
| タブレット横 | 769〜1024px | iPad横向き・Surface |
| PC | 1025px〜 | 管理画面メイン・オンボーディング |

---

## 5. 認証

- **ユーザー側**：電話番号SMS認証（Supabase Auth + Twilio）。ゲスト注文も可能（ログイン任意）
- **店舗側**：メールアドレス＋パスワード（Supabase Auth）
- セッション管理：Supabase JWT

---

## 6. 注文ステータス設計

### 6.1 ステータス一覧
- **pending**：注文作成直後 / 決済中
- **paid**：決済成功（未受理）
- **accepted**：店舗受理
- **preparing**：調理中（MVP省略可）
- **ready**：受取可能
- **completed**：受取完了
- **cancelled**：キャンセル済（返金前）
- **refunded**：返金済
- **no_show**：未受取（ready から一定時間経過）

### 6.2 正常フロー
```
pending → paid（Webhook）→ accepted（店舗）
→ preparing（任意・MVP省略可）→ ready（店舗）→ completed（店舗 手動）
```

### 6.3 例外フロー
```
pending  → cancelled：決済失敗 / タイムアウト
paid     → cancelled → refunded：店舗都合 / サーバー判断
accepted → cancelled → refunded：在庫切れ / 営業時間外
ready    → no_show → completed（サーバー自動・10〜15分後）
```

> ⚠️ **`refunded` への直接遷移は禁止。必ず `cancelled` を経由する。**

### 6.4 権限制御

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

## 7. 決済フロー（Stripe Connect）

### 7.1 原則
- 決済確定は **Webhook のみ**
- フロントで成功判定禁止

### 7.2 フロー
1. 注文作成 API → **在庫・営業時間チェック（1回目）**
2. チェック NG → 注文作成を拒否（決済前に弾く）
3. チェック OK → 注文作成（pending）+ PaymentIntent 作成（1注文1Intent）
4. ユーザー決済
5. Webhook 受信 → **在庫・営業時間・金額チェック（2回目・保険）**
6. チェック OK → `paid` に更新
7. チェック NG → `cancelled` → `refunded`（自動）

> ⚠️ チェックは二段構え。決済後に弾くと返金コストが発生するため、注文作成時に必ず1回目を行う。

### 7.3 Stripe 分配フロー
```
ユーザー支払い
  → Stripe（mocal プラットフォームアカウント）
  → 自動分配：店舗アカウントへ直接入金
  → mocal 収益：Application Fee（6.4%）
```

### 7.4 Webhook 仕様
エンドポイント：`/api/webhook/stripe`

**署名検証（必須）**
```typescript
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  rawBody,  // Buffer（JSON.parse前の生データ）
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
```
> ⚠️ `rawBody` は未パースの Buffer を使うこと。`JSON.parse` 後では署名検証が失敗する。

**paid 確定前のサーバーチェック（Webhook 受信時）**
1. 営業時間内か
2. 商品が提供可能か（在庫・販売状態）
3. 金額一致（Stripe の `amount` と DB の `total_amount`）

**成功（`payment_intent.succeeded`）**：`status = paid`、`stripe_charge_id` 保存
**失敗（`payment_intent.payment_failed`）**：`status = cancelled`

### 7.5 冪等性
```sql
processed_webhook_events (
  stripe_event_id  text PRIMARY KEY,
  processed_at     timestamptz DEFAULT now()
)
```
- `stripe_event_id` を INSERT（重複なら SKIP）
- INSERT できた場合のみ後続処理を実行

### 7.6 Webhook 救済処理（cron）
- 注文作成から5分後、`pending` のままの注文を cron でチェック
- Stripe API で PaymentIntent の状態を再取得・補正

### 7.7 二重注文対策
- `idempotency_key` の導入、または PaymentIntent の先行生成（1注文1Intent）

---

## 8. 待ち時間ロジック

### 8.1 MVP：店舗手動設定
```
estimated_ready_at = accepted_at + wait_minutes（店舗設定値）
```
選択肢：10分 / 15分 / 20分 / 30分 / 40分 / 60分

> ⚠️ `estimated_ready_at` は `accepted` 時に確定する（注文作成時ではない）。

### 8.2 Phase 2：キュー補正
```
estimated_ready_at = accepted_at + wait_minutes + キュー補正
キュー補正 = 現在注文数 × 調整係数（例：3分）
現在注文数 = status IN ('accepted', 'preparing') の件数
```

### 8.3 延長時の挙動
- 店舗は手動で上書き可能
- 延長時はユーザーへ確認通知必須
- ユーザーが承諾しない場合 → キャンセル → 即時返金

---

## 9. no_show 対応

`ready` から **10〜15分** 経過した場合（運用後調整）：

```
ready → no_show（サーバー自動）→ completed（サーバー自動）
```

- ユーザーへ no_show 通知を送信
- 返金は行わない（受取可能状態だったため）
- `no_show_at` を記録し運用データとして活用

---

## 10. データベース設計

### orders テーブル
```sql
orders (
  id                       uuid PRIMARY KEY,
  order_number             int NOT NULL,
  store_id                 uuid NOT NULL REFERENCES stores(id),
  user_id                  uuid REFERENCES profiles(id),  -- nullable（ゲスト）
  status                   text NOT NULL DEFAULT 'pending',
  pickup_type              text NOT NULL,          -- 'standard' | 'scheduled'
  scheduled_at             timestamptz,
  total_amount             int NOT NULL,
  estimated_ready_at       timestamptz,            -- accepted時に確定
  accepted_at              timestamptz,
  ready_at                 timestamptz,
  no_show_at               timestamptz,
  cancelled_reason_type    text,                   -- enum参照
  cancelled_reason_detail  text,
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  created_at               timestamptz DEFAULT now()
)
```

### cancelled_reason_type（enum）
`store_closed` / `out_of_stock` / `user_cancel` / `timeout` / `payment_failed` / `amount_mismatch`

### その他テーブル（MVP最小構成）
```sql
stores       (id, name, stripe_account_id, is_open, wait_minutes, created_at)
menu_items   (id, store_id, name, price, category, emoji, is_available, sort_order)
profiles     (id, phone, nickname, created_at)  -- auth.users.id と紐付け
order_items  (id, order_id, menu_item_id, name, price, qty)  -- 名前・価格はスナップショット
store_members(id, store_id, user_id, role)  -- RLS用
processed_webhook_events (stripe_event_id PK, processed_at)
```

---

## 11. 通知仕様

### 11.1 通知トリガー

| タイミング | 通知先 | 内容 |
|---|---|---|
| paid | 店舗 | 新規注文が入りました |
| accepted | ユーザー | 注文を受け付けました |
| ready | ユーザー | **準備完了（最重要）** |
| no_show | ユーザー | お時間が経過しました |
| cancelled → refunded | ユーザー | キャンセル・返金のお知らせ |

### 11.2 失敗時リトライ
- 最大3回リトライ・失敗時はログ保存

### 11.3 チャネル
- **MVP**：WebPush のみ
- **Phase 2**：SMS 追加（ゲスト注文ユーザー向けに強く推奨）

---

## 12. 店舗オペレーション

| 操作 | 遷移 |
|---|---|
| 受理ボタン | paid → accepted（自動印刷・`estimated_ready_at` 確定） |
| 調理開始ボタン | accepted → preparing（MVP省略可） |
| 準備完了ボタン | preparing（or accepted）→ ready（ユーザー通知） |
| 受取確認ボタン | ready → completed（手動） |
| キャンセルボタン | 任意 → cancelled → refunded（サーバー自動） |

---

## 13. キャンセル・返金ポリシー

- **ユーザーキャンセル**：原則不可。例外：店舗が受取時間を延長する場合、ユーザーが承諾しなければキャンセル→即時全額返金
- **店舗キャンセル**：保留（MVP後に決定）
- **返金処理**：Stripe Refunds API で即時処理 → WebPush通知 → `refunded` に更新

---

## 14. 決済手段ロードマップ

| フェーズ | 手段 | 方法 |
|---|---|---|
| MVP | Visa / Master / Amex / JCB | Stripe Connect |
| MVP | Apple Pay / Google Pay | Stripe Connect |
| Phase 2 | PayPay | PayPay for Business 別途契約 |
| Phase 2 | 楽天Pay | 楽天ペイ加盟店 別途契約 |
| Phase 3 | Suica / PASMO（teppay） | 2026年夏〜加盟店募集予定 |

---

## 15. セキュリティ設計

### 15.1 Supabase RLS 基本方針
```sql
CREATE POLICY "users_own_orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "store_own_orders" ON orders
  FOR ALL USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

CREATE POLICY "public_menu_read" ON menu_items FOR SELECT USING (true);

CREATE POLICY "store_own_menu" ON menu_items
  FOR ALL USING (
    store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );
```

### 15.2 ゲスト注文の照会保護
- 照会キー = `order_id`（UUID）+ 注文時入力の電話番号
- 照会 API は両方一致した場合のみレスポンスを返す
- レート制限：同一 IP から10回/分を超えたらブロック

### 15.3 API レート制限

| エンドポイント | 制限 |
|---|---|
| `POST /api/orders` | 10回/分/IP |
| `POST /api/auth/sms` | 5回/時/電話番号 |
| `GET /api/orders/:id` | 30回/分/IP |
| 決済試行 | 5回/時/IP（bot対策） |
| `POST /api/webhook/stripe` | 制限なし |

### 15.4 その他
- CSRF 対策を注文 API に実装
- Stripe Secret Key・Supabase `service_role` キーはサーバーサイドのみ
- `STRIPE_WEBHOOK_SECRET` は本番・テスト環境で別々に設定
- Next.js の `server-only` を使用してフロントへの露出を防ぐ

---

## 16. エラー設計

| コード | 内容 | 対応 |
|---|---|---|
| E001 | 決済失敗 | ユーザーに再試行促す。`cancelled` に遷移 |
| E002 | 在庫切れ | 注文作成時に拒否 or Webhook 時にキャンセル→返金 |
| E003 | 店舗受付停止 | 注文作成時に拒否（フロント・API 両方で制御） |
| E004 | 通信エラー | リトライ。Webhook は冪等性で保護 |
| E005 | 金額不一致 | Webhook 処理中断・アラート発報・自動返金 |

---

## 17. 開発フェーズ

### Phase 1 — MVP
1. Supabase スキーマ作成・RLS 設定
2. SMS認証（Supabase Auth + Twilio）
3. 注文フロー実装（フロント → Supabase → Realtime）
4. Stripe Connect 決済実装
5. WebPush 通知
6. 店舗管理画面の実装

### Phase 2 — 運用品質
7. キャンセル・返金処理（ポリシー確定後）
8. レシート印刷連携（AirPrint）
9. 店舗オンボーディングフロー実装
10. PayPay・楽天Pay 対応
11. キュー補正・待ち時間の自動化
12. SMS 通知追加

### Phase 3 — 成長
13. LP 公開・SEO
14. レポート・ABC分析の実データ連携
15. teppay（Suica/PASMO）対応（2026年秋以降）
16. プロプラン機能追加（複数店舗・スタッフ管理）

---

## 18. 画面構成

### ユーザー側（PWA・Web）
| 画面 | プロトタイプ | 状態 |
|---|---|---|
| TOP・メニュー・カート・完了 | mocal_app.html | 完成 |
| アップセル | mocal_app.html | 完成 |
| 注文履歴・領収書 | mocal_app.html | 完成 |
| マイページ | mocal_app.html | 完成 |
| SMS認証ログイン | — | 未実装 |
| エラー画面 | — | 未実装 |

### 店舗管理画面（iPad / PC）
| 画面 | プロトタイプ | 状態 |
|---|---|---|
| 注文管理 | mocal_admin.html | 完成 |
| 注文履歴タブ | mocal_admin.html | 完成 |
| メニュー管理 | mocal_admin.html | 完成 |
| 営業時間・受付設定 | mocal_admin.html | 完成 |
| レポート・ABC分析 | mocal_admin.html | 完成 |
| レシート印刷 | mocal_admin.html | 完成 |
| 店舗ログイン | — | 未実装 |
| キャンセル・返金処理UI | — | 未実装 |

### その他
| 画面 | プロトタイプ | 状態 |
|---|---|---|
| コンセプト LP | mocal_concept.html | 完成 |
| 店舗オンボーディング | mocal_onboarding.html | 完成 |
| 特定商取引法 | mocal_tokushoho.html | 仮完成（要更新） |
| プライバシーポリシー | — | 未作成 |

---

## 19. 設計原則

1. 決済確定は Webhook のみ
2. 返金は必ず `cancelled` を経由する
3. ステータスは単一責任で変更
4. Webhook は署名検証・冪等性・金額整合性の3点を必ず実装
5. 非同期処理前提で設計する
6. 店舗オペレーションを最優先に設計する
7. Secret Key 類はサーバーサイドのみ
8. 店舗判断に依存しすぎない（サーバー自動処理を活用）
9. 例外系を先に設計する
10. 放置データを作らない（no_show・cron による補正）

---

## 20. 未決事項

| 項目 | 現状 | 決定時期 |
|---|---|---|
| 住所・電話番号・メール | 法人設立後に更新 | 設立後 |
| no_show の時間 | 10〜15分（運用後調整） | 運用後 |
| 店舗都合キャンセルの責任範囲 | 保留 | MVP後 |
| `preparing` の有無 | MVP省略可として保留 | 実装開始前 |
| SMS 導入タイミング | Phase 2 以降 | 運用後 |
| キュー補正の係数 | Phase 2 で決定 | 運用データ取得後 |
| teppay 加盟店登録 | 2026年夏〜募集開始予定 | 募集開始後 |
| プライバシーポリシー | 未作成 | MVP前 |

---

## 21. コーディング規約

- TypeScript strict モード
- コンポーネント命名：PascalCase
- API ルート：`/api/` 以下に集約
- Supabase クライアント：`lib/supabase.ts` に集約
- Stripe クライアント：サーバーサイドのみ（`lib/stripe.ts`）
- 環境変数：`.env.local`（`.gitignore` に必ず追加）
- コメント：日本語 OK
