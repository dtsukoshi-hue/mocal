# 顧客認証 — P3 Anonymous Sign-Ins 実装設計

> **status**: ユーザー承認済 / 実装待ち  
> **対応**: backlog #25 (F-18) 修正本体 / #32 (実装)  
> **作成**: 2026-05-21 / Opus  
> **経緯**: 旧 A+ (自前 JWT signing) 案は `docs/customer-jwt-design.md` に SUPERSEDED として保持

---

## 0. 目的 / 非目的

### 目的
- F-18 (anon SELECT で全 orders / order_items が漏洩) を解消
- 顧客の Realtime 注文ステータス更新を維持
- 「URL = bearer」の原意（URL を知っている人がアクセス可能）を**サーバー経由のみ**で再定義
- 再発防止策（#26-30）で測れる「修正完了」を実現

### 非目的
- 顧客向け持続的アカウント機能（メール / OTP 等は別タスク #11）
- 店舗側 RLS の変更（影響範囲外）
- 自前 JWT signing infrastructure（P3 で不要化）

---

## 1. 背景・採択理由（要約）

詳細は `docs/security-review-2026-05-21.md` F-18 と backlog #31 参照。

検討した 4 案:
- P1 (Legacy HS256 自前 sign) — Supabase deprecation 方針逆走、却下
- P2 (自前 ES256 + Third-Party Auth) — 複雑、plan 依存性あり、却下
- **P3 (Anonymous Sign-Ins) — 採択**
- P4 (Realtime 廃止 + polling) — UX 劣化、却下

**P3 採択理由**:
- Supabase canonical pattern、未来永劫互換性が保たれる方向性
- 既存 RLS `orders_user_own_select USING (auth.uid() = user_id)` がそのまま使える
- mocal の既存 API key 体系（`sb_publishable_*` / `sb_secret_*`）と完全整合
- 自前 JWT signing 不要、env 追加なし
- 実装規模が当初想定の約 1/3
- Anonymous Sign-Ins は本プロジェクトで**既に有効**（Authentication 画面で確認済）

---

## 2. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│  顧客フロー (#37 refactor 後)                                     │
│                                                                  │
│  /[slug] (店舗ページ)                                            │
│   - 通常ブラウズ。sign-in なし（MAU 浪費防止）                    │
│   - 公開 RLS (USING true) で stores / menu_items 等を読む         │
│   - Cart コンポーネントは auth ロジックを一切持たない              │
│                                                                  │
│  Cart 「お支払い」ボタン                                          │
│   ↓ form submit (action={action}) — 純粋な form                  │
│   ↓                                                              │
│  createOrderAction (Server Action)                                │
│   1. ensureCustomerSession()     ← lib/customer-session.ts        │
│      - cookies から user を取得、無ければ signInAnonymously       │
│      - cookies はレスポンスに自動設定（@supabase/ssr）            │
│      - 戻り値: User（必ず非 null を保証）                          │
│   2. INSERT orders (user_id = user.id)   ← service_role           │
│   3. INSERT order_items                                          │
│   4. PaymentIntent 作成                                          │
│   5. return { clientSecret, orderId, orderNumber }               │
│   6. Stripe Elements で決済                                       │
│   7. 成功 → /orders/{id} へ遷移                                  │
│                                                                  │
│  /orders/{id} (注文ステータスページ)                              │
│   - server: createServiceClient で order を取得（変わらず）       │
│   - client: 既に cookie に session があるので createBrowserClient │
│     が自動的に拾う → Realtime auth に使われる                     │
│   - RLS orders_user_own_select USING (auth.uid() = user_id) で OK│
│   - polling: NEXT_PUBLIC_ORDER_POLLING_MS (default 10s)          │
│                                                                  │
│  /orders (注文履歴ページ)                                        │
│   - localStorage の UUID 群を /api/orders/lookup へ送信           │
│   - service_role で取得（変わらず）                                │
└─────────────────────────────────────────────────────────────────┘

設計の中心: **lib/customer-session.ts** が顧客認証の primitive。
全ての顧客系 Server Action はこれを呼ぶだけで session 確保を完結できる。
将来 #11 (email + OTP 顧客ログイン) では、この primitive 内で
「anonymous か authenticated か」を判別する分岐を追加するだけで、
呼び出し側のコードは変更不要。

┌─────────────────────────────────────────────────────────────────┐
│  Supabase 側 RLS（変更後）                                        │
│                                                                  │
│  DROP 漏洩 policy:                                               │
│   - orders_public_select_by_uuid (USING true)                    │
│   - orders_guest_select_by_id    (USING user_id IS NULL)         │
│   - order_items_guest_select     (NULL guest)                    │
│   - order_items_guest_insert     (USING true)                    │
│   - webhook_events_select        (USING true)                    │
│                                                                  │
│  既存 policy で機能:                                              │
│   - orders_user_own_select USING (auth.uid() = user_id)          │
│     → 自分の anonymous UID と一致する注文だけ見える               │
│   - order_items_user_own_select (parent order 経由)              │
│   - その他 store_member / public_read 系                          │
│                                                                  │
│  REVOKE:                                                         │
│   - orders / order_items / processed_webhook_events への         │
│     anon SELECT/UPDATE/DELETE                                    │
│   - orders_guest_insert は維持（status='pending' / user_id IS    │
│     NULL 制限あり）。但し新フローでは service_role 経由なので未使用 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. ユーザーフロー詳細

### A. 通常注文フロー (#37 refactor 後)

1. 顧客が `/[slug]` を訪問。ログインなし、anon role で menu / stores を読む
2. カートに追加（ローカル state）
3. 「お支払い」をタップ
4. **Cart は純粋に form submit するだけ**（auth ロジックなし）
5. `createOrderAction` (Server Action) で `ensureCustomerSession()` を呼ぶ
   - 既存 session があればそれを使い、無ければ `signInAnonymously()`
   - Cookies は Server Action のレスポンスに自動設定される
6. 注文を INSERT (`user_id = user.id`)
7. PaymentIntent 作成、`clientSecret` を返す
8. Stripe Elements で決済 → success
9. `/orders/{order_id}` へ遷移
10. ページ描画は server-side (`createServiceClient`)
11. クライアント側 `OrderStatusView` の `createBrowserClient` が
    cookies から session を自動取得 → Realtime チャネル subscribe
12. RLS で `auth.uid() = user_id` 一致 → Realtime UPDATE が届く

### B. 同一端末でのリピート注文

- ステップ 4 で `signInAnonymously` は session 検出してスキップ
- 既存 UID で新注文作成
- 同じユーザーの複数注文が DB に紐づく

### C. 別端末で URL 共有された場合

- 別端末: session 違う（or なし）
- `/orders/{id}` を開く → server-render は service_role で動作 → 注文情報表示
- Realtime channel subscribe → RLS が `auth.uid() != user_id` で deny
- ポーリング fallback (10s 間隔) で status 更新追従
- これが「URL=bearer」の honest な実装：見えはするが live update は原作成端末で

---

## 4. RLS 変更 (migration SQL)

```sql
-- Migration: <timestamp>_customer_anon_auth_rls.sql

-- ============================================================
-- 1. F-18 漏洩 policy を DROP
-- ============================================================

DROP POLICY IF EXISTS "orders_public_select_by_uuid" ON public.orders;
DROP POLICY IF EXISTS "orders_guest_select_by_id"   ON public.orders;
DROP POLICY IF EXISTS "order_items_guest_select"    ON public.order_items;
DROP POLICY IF EXISTS "order_items_guest_insert"    ON public.order_items;
DROP POLICY IF EXISTS "webhook_events_select"       ON public.processed_webhook_events;

-- ============================================================
-- 2. anon role への過剰な GRANT を REVOKE
-- ============================================================

REVOKE SELECT, UPDATE, DELETE ON public.orders      FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.order_items FROM anon;
REVOKE ALL ON public.processed_webhook_events       FROM anon;

-- 注: orders_guest_insert は維持
-- (status='pending' AND user_id IS NULL の制限あり、新フローでは未使用だが
--  防御層として残す。anon の INSERT GRANT は元々あるので追加 GRANT 不要)

-- ============================================================
-- 3. 既存の orders_user_own_select / order_items_user_own_select が
--    Anonymous Sign-In ユーザーに対しても動作することを期待
--    (auth.uid() = user_id で match)
--    → 追加 policy 作成不要
-- ============================================================
```

### 確認: 既存 RLS が anonymous user で動くか

`auth.uid()` は anonymous user でも JWT 内の `sub` を返す。
`orders.user_id` は anonymous user の UID。
両者一致 → `orders_user_own_select` の `USING (auth.uid() = user_id)` が true。
∴ 動く ✅

---

## 5. コード変更箇所

### 5.1 #32 (初回実装) と #37 (refactor) の最終形

| ファイル | 変更内容 |
|---|---|
| **`lib/customer-session.ts`** (新規) | 顧客認証の primitive。`ensureCustomerSession()` / `getCustomerSession()` を export。Server-only |
| **`app/actions/orders.ts`** | `createOrderAction` 冒頭で `await ensureCustomerSession()`。`user_id = user.id` で INSERT |
| **`app/(store)/[slug]/_components/Cart.tsx`** | **変更なし**（auth ロジックを Server Action に集約） |
| **`app/(store)/orders/[id]/_components/OrderStatusView.tsx`** | `POLLING_INTERVAL_MS` を `NEXT_PUBLIC_ORDER_POLLING_MS` env から読む（default 10s） |
| **`supabase/migrations/20260521141348_customer_anon_auth_rls.sql`** (新規) | §4 SQL |
| **`tests/security/anon-rest-access.test.ts`** | 修正完了後ガード撤廃（default で走る） |
| **`tests/lib/customer-session.test.ts`** (新規) | primitive の unit test（6 ケース） |
| **`.env.local.example`** | `NEXT_PUBLIC_ORDER_POLLING_MS` 追記 |
| **`docs/customer-auth-design.md`** | このドキュメント |

### 5.2 変更**しない** ファイル

- `lib/customer-jwt.ts` — 作らない
- `lib/env.ts` — JWT 関連 env 追加なし
- `lib/email.ts` — メール URL に何も追加不要
- `app/api/orders/[id]/push/route.ts` — service_role で動作、変更不要
- `app/(store)/[slug]/_components/MenuView.tsx` — stores 公開 RLS は維持
- `app/api/orders/lookup/route.ts` — service_role、変更不要
- Stripe webhook、cron、admin 系すべて — 影響なし

### 5.3 拡張ポイント

将来の顧客機能（backlog #9 cancel / #11 顧客ログイン等）は **`ensureCustomerSession()` を呼ぶだけ**で session 取得が完結する。
auth まわりの変更は `lib/customer-session.ts` 一箇所に閉じる設計。

---

## 6. デプロイ手順 / cutover 戦略

### Pre-deploy チェック（runbook #35 候補）

1. 現在の active 注文（status IN ('paid','accepted','preparing','ready')）数を確認
2. 0 件 OR 数件 程度になるまで待つ
3. JST 深夜帯（3〜5 AM）など低トラフィック時間帯を選ぶ

### Deploy 手順

1. PR / merge → main push（Vercel 自動 deploy 開始）
2. Vercel deploy 完了確認
3. `npx supabase db push --linked` で migration 適用
4. `npm run test:security` を実行 → 全 PASS 確認
5. 手動 smoke:
   - 新規注文を 1 件作成（テスト店舗で）
   - 決済 → /orders/{id} 表示
   - Realtime 更新（status 変更を別ブラウザでトリガー）
   - 別端末で同 URL 開く → 表示 OK、Realtime は静かに失敗 + polling fallback で更新

### Transition 期間（24h）の特例

- 一時的にポーリングを 5s に短縮するため、`OrderStatusView` の interval を env で切り替え可能にする（任意・実装簡易なら 10s 固定でも可）
- 24h 経過後、新規注文は全て anonymous user 経由 → 既存 NULL user_id 注文は順次 terminal 到達で消える

---

## 7. テスト計画

### Unit (vitest)

- `tests/api/orders-action.test.ts` 修正:
  - session なしで `createOrderAction` を呼ぶと error
  - session あり (mock auth.uid) で正常 INSERT

### Security regression (vitest, real Supabase)

- `tests/security/anon-rest-access.test.ts` の `RUN_SECURITY_TESTS` ガード撤廃
- 既存 11 ケースが全 PASS:
  - anon が orders / order_items / processed_webhook_events / push_subscriptions / store_members / profiles を SELECT 不可
  - anon が stores / menu_items / store_hours / combo_offers は SELECT 可
- **追加ケース**:
  - 同一 anonymous session で自分の注文だけ SELECT 可
  - 別 anonymous session で他人の注文は SELECT 不可

### E2E (Playwright)

- Cart submit → order 作成 → /orders/{id} で Realtime 動作確認
- 別ブラウザコンテキストで同 URL を開いた時、polling で status 追従確認

---

## 8. Rollback 計画

### A. RLS 全戻し（緊急時）

```sql
-- 緊急 rollback migration
CREATE POLICY "orders_public_select_by_uuid_TEMP" ON public.orders
  FOR SELECT USING (true);
GRANT SELECT ON public.orders, public.order_items TO anon;
```

→ F-18 を**意図的に再露出**。security test が即 FAIL に切り替わり、状態が可視化される。

### B. Code revert

`git revert <commit>` で旧コードに戻す。client が `signInAnonymously` を呼ばなくなる。

### Rollback トリガー条件

- `/orders/{id}` が 500 を返す
- `npm run test:security` がいきなり PASS → FAIL（想定外の RLS 変化）
- 顧客から「ステータス画面が真っ白 / 注文できない」報告

---

## 9. MAU / DB 影響予測

| 項目 | pilot 期 (100/月) | 中期 (1000/月) |
|---|---|---|
| 月間新規 anonymous user | 100 | 1000 |
| 年間累計 auth.users 行 | 1,200 | 12,000 |
| DB 増加量 (年) | ~1 MB | ~12 MB |
| Free plan MAU 上限 | 50,000 | 50,000 |
| Free plan DB 上限 | 500 MB | 500 MB |

→ pilot から中期まで Free plan で完全に収まる。  
→ DB 使用率 > 50% で cleanup cron 起動（#34）を判断。

---

## 10. 残課題・関連バックログ

- **#26** anon REST security regression test (完了) → A+ 実装後にガード撤廃
- **#33** CAPTCHA 導入（anonymous sign-in 保護、本格運用前）
- **#34** anonymous user cleanup cron（90 日無活動、低優先）
- **#35** deploy runbook 文書化
- **#36** Server Action へのレート制限拡張
- **#15** 監視・アラート整備（anonymous sign-in rate 異常検知含む）

---

## 11. 設計の透明性 — なぜここに至ったか

このドキュメントは **3 回設計を改訂した結果**:

1. 当初 A+ (URL fragment + 自前 JWT): UX 劣化を許容する妥協が多数混入
2. 改訂 A+ (Server Component prop + 自前 JWT): UX 改善されたが Supabase の鍵管理制約で自前 signing が困難と判明
3. **最終 P3 (Anonymous Sign-Ins)**: Supabase canonical pattern、最小実装、最大の整合性

この経緯から得た原則（既に `AGENTS.md` / `docs/rls-review-checklist.md` に反映）:

- ベンダー（Supabase）の現行方針を最初に確認する
- 自前で primitive を作る前に canonical pattern があるかチェック
- 「シンプル化」と「劣化許容」を混同しない
- 設計段階で残課題を洗い出し、後発で増殖させない

---

## 関連ドキュメント

- `docs/security-review-2026-05-21.md` — F-18 経緯
- `docs/rls-review-checklist.md` — RLS 設計の原則
- `docs/customer-jwt-design.md` — SUPERSEDED な旧設計（教材として保持）
- `docs/workflow.md` — アーキテクチャ全体図
- `tests/security/anon-rest-access.test.ts` — 修正完了の客観指標
