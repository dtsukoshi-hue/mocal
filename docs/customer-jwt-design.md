# ⚠️ SUPERSEDED — 旧設計 (A+ JWT 自前 signing)

> **このドキュメントは破棄された案です**。実装には使いません。
> 後継: `docs/customer-auth-design.md` (P3 Anonymous Sign-Ins)
>
> ## なぜ破棄したか
> 1. Supabase Dashboard 確認の結果、Current Key は ECC (P-256) 管理型で **private key が exposed されない** → 自前 signing 経路がない
> 2. Legacy HS256 secret は "Used only to verify JWTs" と Supabase 自身が明示、deprecation 路線
> 3. 自前 ES256 鍵ペア + Third-Party Auth 路線も検討したが、Supabase canonical な **Anonymous Sign-Ins** が同等以上の機能を提供することが判明
> 4. P3 採用で実装が **約 1/3 に simplify**、新規 env / JWT signing infra も不要、既存 RLS が活きる
>
> 教材として残す。詳細経緯は backlog #31 と `docs/security-review-2026-05-21.md` F-18 参照。
>
> ---

# 顧客 JWT 認証 — A+ 実装設計 (破棄案)

> **status**: 設計フェーズ / ユーザーレビュー待ち  
> **対応**: backlog #25 (F-18) / #32 (実装)  
> **作成**: 2026-05-21 / Opus

---

## 0. 目的 / 非目的

### 目的
- F-18 (RLS の `orders / order_items` anon SELECT 漏洩) を解消する
- 「顧客 URL = アクセス証明」設計を Supabase 上で**真に enforce する**
- 顧客のリアルタイム更新（Realtime）を維持し、UX を劣化させない
- 再発防止策（#26-30）で測れる「修正完了」を実現する

### 非目的
- 顧客アカウント機能の導入（別タスク、backlog #11）
- 店舗側 RLS の変更（影響範囲外）
- Stripe / Push 通知 / cron など他系統の認可ロジック変更

---

## 1. 背景

詳細は `docs/security-review-2026-05-21.md` F-18 と `docs/backlog.md` #25 参照。要点:

- 現状 `orders_public_select_by_uuid ON orders FOR SELECT USING (true)` で anon が全 orders を SELECT 可能
- 設計意図「UUID = bearer token」が RLS では実装されていない
- 修正方針として **A+ (注文ごとに JWT 発行)** を選択（B = polling 切替は UX 劣化のため不採択）

### ユーザー確定事項

| # | 決定 |
|---|---|
| 既存注文 | **全 invalidate**（cutover デプロイ） |
| TTL | **注文作成から 7 日 OR terminal state (completed/cancelled/refunded/no_show) 到達から 24h、どちらか早い方** |
| URL 配置 | **URL fragment (`#t=<jwt>`)** — server には絶対送信されない |
| Signing key | **`SUPABASE_JWT_SECRET`** を新規 env として導入（Supabase Dashboard 由来） |

---

## 2. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│  注文作成フロー (server)                                          │
│                                                                  │
│  createOrderAction                                               │
│   1. orders INSERT (server-side, service_role)                   │
│   2. JWT 発行: signJwt({ sub: order_id, exp, ... })              │
│   3. PaymentIntent.metadata.order_id = order_id                  │
│   4. return { orderId, jwt, clientSecret }                       │
│                                                                  │
│  → ブラウザ: /orders/{order_id}#t=<jwt> へ遷移                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  顧客ページ表示 (mixed)                                            │
│                                                                  │
│  /orders/[id]/page.tsx (Server Component)                        │
│   - 描画は service_role で読み取り（JWT 無関係）                  │
│   - props として initialOrder を OrderStatusView へ渡す           │
│                                                                  │
│  OrderStatusView (Client Component)                              │
│   1. window.location.hash から JWT を抽出                         │
│   2. supabase.auth.setSession({ access_token: jwt })             │
│   3. .channel().on('postgres_changes', filter=eq.<id>)           │
│   4. Realtime → RLS が JWT 検証 → 自分の注文のみ受信              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Supabase 側 RLS                                                 │
│                                                                  │
│  orders FOR SELECT:                                              │
│    USING (                                                       │
│      (auth.jwt() ->> 'type' = 'mocal_customer'                   │
│       AND id::text = (auth.jwt() ->> 'order_id'))                │
│      OR (auth.uid() = user_id)                  -- 将来の会員機能 │
│      OR (store_id IN store_members of auth.uid()) -- 店舗側       │
│    )                                                             │
│                                                                  │
│  → anon (JWT なし) は全拒否                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. JWT 構造

### 署名

- アルゴリズム: **HS256**（Supabase のデフォルト互換）
- 鍵: `SUPABASE_JWT_SECRET`（Supabase Dashboard → Project Settings → API → JWT Secret）
- ライブラリ: [`jose`](https://github.com/panva/jose)（Vercel Edge 互換、Node 標準）または `jsonwebtoken`

### Claim 構造

```json
{
  "iss": "supabase",
  "aud": "authenticated",
  "role": "authenticated",
  "sub": "<order_uuid>",
  "order_id": "<order_uuid>",
  "type": "mocal_customer",
  "iat": 1748419200,
  "exp": 1749024000
}
```

| Claim | 内容 |
|---|---|
| `iss` | `"supabase"` — Supabase が認識する issuer |
| `aud` | `"authenticated"` — Supabase が認識する audience |
| `role` | `"authenticated"` — DB role（anon ではなく authenticated に） |
| `sub` | order_uuid — Supabase auth.uid() がこれを返す |
| `order_id` | order_uuid — 明示的な claim（RLS で参照） |
| `type` | `"mocal_customer"` — customer JWT であることを識別（他系統と判別） |
| `iat` | 発行時刻 (Unix sec) |
| `exp` | 失効時刻 (Unix sec) |

### `type` claim の必要性

`role: authenticated` は店舗オーナー / スタッフも持つ。
これらと customer JWT を **RLS で確実に区別**するため `type` を追加。

```sql
-- 店舗メンバー policy: type 制約なし（任意の authenticated でメンバーシップ要件）
USING (store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid()))

-- customer policy: type = mocal_customer かつ id が一致
USING (auth.jwt() ->> 'type' = 'mocal_customer' AND id::text = auth.jwt() ->> 'order_id')
```

これで customer JWT が誤って store_member policy をパスする事故を防ぐ。

---

## 4. TTL 設計

### 計算式

```ts
const TTL_DEFAULT_SEC = 7 * 24 * 60 * 60  // 7日
const exp = Math.floor(Date.now() / 1000) + TTL_DEFAULT_SEC
```

### Terminal state 到達後の扱い

注文が `completed / cancelled / refunded / no_show` に到達したら、**24h 後に必ず expire** させたい。  
ただし JWT は再発行できない（client がすでに持っている）ため、以下の戦略:

1. **発行時に 7 日 fixed TTL** を設定
2. **DB 側で別途 expiry 列を持つ**（`orders.access_jwt_expires_at`）
3. RLS では JWT の `exp` を見るのみ。terminal state 到達からの 24h は RLS 側の追加 condition で:
   ```sql
   USING (
     auth.jwt() ->> 'type' = 'mocal_customer'
     AND id::text = (auth.jwt() ->> 'order_id')
     AND (
       status NOT IN ('completed', 'cancelled', 'refunded', 'no_show')
       OR (ready_at IS NULL OR (now() - ready_at < interval '24 hours'))
       OR (no_show_at IS NULL OR (now() - no_show_at < interval '24 hours'))
     )
   )
   ```

これで「7 日経過 = JWT exp で expire」と「terminal 24h 経過 = RLS で拒否」の両方を実現。

> **シンプル化候補**: TTL = 7 日 fixed のみとし、terminal 24h ロジックを実装しない案もある。判断保留。
> 一旦 fixed 7 日で実装し、UX フィードバックで改善することを推奨。
> （以下、本ドキュメントでは fixed 7 日案で進める）

---

## 5. 発行フロー

### A. 新規注文作成時

`app/actions/orders.ts` の `createOrderAction` 内で:

```ts
// 既存処理（注文 INSERT）の後に追加
const customerJwt = await signCustomerJwt({
  orderId: order.id,
  ttlSec: 7 * 24 * 60 * 60,
})

return {
  clientSecret,
  orderId: order.id,
  orderNumber: order.order_number,
  customerJwt,  // ← 追加
}
```

### B. JWT 発行ヘルパー（新規）

`lib/customer-jwt.ts`:

```ts
import 'server-only'
import { SignJWT } from 'jose'

const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)

export async function signCustomerJwt(params: {
  orderId: string
  ttlSec?: number
}): Promise<string> {
  const ttl = params.ttlSec ?? 7 * 24 * 60 * 60
  return new SignJWT({
    sub: params.orderId,
    order_id: params.orderId,
    role: 'authenticated',
    type: 'mocal_customer',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('supabase')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(SECRET)
}
```

### C. 既存注文の取り扱い（invalidate 戦略）

**「invalidate」= 古い URL（fragment 無し）でアクセスしてきても client-side では Realtime が動かない**。
ただし、server-side rendering（service_role）は変わらず動くので**ページ自体は見られる**。  
影響: Realtime が動かない＝ステータス更新が来ない。30秒ポーリング fallback でリカバー。

**つまり既存注文も「ページが死なない」**。UX 劣化は「即時更新が 30s 遅延更新になる」のみ。

> **発展案**（任意・別タスク化）: 既存全注文に対し、サーバー側で JWT を発行し直し、push 通知で `https://...?refresh-token` 形式で配信。実装コストとのトレードオフで、まずは「invalidate = ページは見えるが Realtime のみ落ちる」を許容。

---

## 6. クライアント側の使用

### URL fragment からの取り出し

```ts
// OrderStatusView.tsx の useEffect 内
const hash = typeof window !== 'undefined' ? window.location.hash : ''
const jwt = new URLSearchParams(hash.slice(1)).get('t')

if (jwt) {
  await supabase.auth.setSession({
    access_token: jwt,
    refresh_token: '',  // refresh 不要（TTL 切れたらフェードアウト）
  })
}
```

### Realtime チャネル

```ts
const channel = supabase
  .channel(`order-${order.id}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `id=eq.${order.id}`,
  }, (payload) => { ... })
  .subscribe()
```

`setSession` 後に `.channel()` を作れば、その JWT で RLS が評価される。

### 失敗時の挙動

- JWT 無効 / 期限切れ → `setSession` が reject
- Realtime チャネルが subscribe エラー
- 既存の 30 秒ポーリングがフォールバック動作
- ページは描画されたまま、更新が遅くなるだけ

---

## 7. RLS ポリシー変更

### 削除するポリシー（F-18 起源）

```sql
DROP POLICY "orders_public_select_by_uuid" ON public.orders;
DROP POLICY "orders_guest_select_by_id"   ON public.orders;
DROP POLICY "order_items_guest_select"     ON public.order_items;
-- order_items_guest_insert もレビュー（INSERT も anon に広開なので絞る検討）
```

### 追加するポリシー

```sql
-- orders: customer JWT 経由の SELECT
CREATE POLICY "orders_customer_jwt_select" ON public.orders
  FOR SELECT USING (
    auth.jwt() ->> 'type' = 'mocal_customer'
    AND id::text = (auth.jwt() ->> 'order_id')
  );

-- order_items: 親 order が customer JWT で見える場合のみ
CREATE POLICY "order_items_customer_jwt_select" ON public.order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE auth.jwt() ->> 'type' = 'mocal_customer'
      AND id::text = (auth.jwt() ->> 'order_id')
    )
  );
```

### REVOKE / GRANT

```sql
-- anon は orders / order_items を SELECT できない（INSERT のみ guest 注文作成で必要）
REVOKE SELECT, UPDATE, DELETE ON public.orders      FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.order_items FROM anon;
REVOKE ALL ON public.processed_webhook_events FROM anon;
```

`orders_guest_insert` policy は維持（status=pending + user_id=null の制限あり）。  
`order_items_guest_insert` も維持するか REVOKE するかは要レビュー（攻撃面と運用必要性のトレードオフ）。

> **推奨**: order_items の anon INSERT も REVOKE する。createOrderAction は service_role を使うため anon INSERT は不要。

---

## 8. 影響範囲（コード変更箇所）

| ファイル | 変更内容 |
|---|---|
| `lib/customer-jwt.ts` | **新規** — JWT 発行ヘルパー |
| `lib/env.ts` | `SUPABASE_JWT_SECRET` を REQUIRED に追加 |
| `.env.local.example` | `SUPABASE_JWT_SECRET=""` を追記 |
| `app/actions/orders.ts` | createOrderAction が JWT を発行・返却 |
| `app/(store)/[slug]/_components/Cart.tsx` | 注文成功後の URL を `/orders/{id}#t={jwt}` に |
| `app/(store)/orders/[id]/_components/OrderStatusView.tsx` | hash から JWT 取り出し → setSession |
| `lib/email.ts` | sendOrderConfirmEmail の orderStatusUrl に `#t=` を追加（要 JWT を引数で受ける） |
| `app/api/webhook/stripe/route.ts` | email 送信時の URL を JWT 付きに（注: JWT を email に乗せる是非は議論余地。下記参照） |
| `supabase/migrations/<ts>_customer_jwt_rls.sql` | **新規** — RLS 変更 SQL |
| `tests/security/anon-rest-access.test.ts` | ガード `RUN_SECURITY_TESTS` を撤廃 → default で走る |
| `tests/api/webhook-stripe.test.ts` | email 送信先 URL のテスト調整 |
| `package.json` | `jose` を deps に追加 |

### email に JWT を含めるかの判断

メール本文に JWT を含めると、メールの**保管期間 = JWT 寿命**になる。漏洩面が増える。

**選択肢**:
- A: メール URL は `/orders/{id}` のみ（JWT なし）→ 顧客がメールから来ると Realtime 動かない（既存注文と同じ扱い）
- B: メール URL は `/orders/{id}#t={jwt}` （注文確認 / ready / cancelled 等）→ 漏洩面増だが UX 向上
- C: メール URL は `/orders/{id}?ref={short_code}` で短いコード経由 → サーバーがコードを JWT に変換してリダイレクト

**推奨**: **A**（メールでは JWT を運ばない）。メールを開いた時点で 7 日経過していたら JWT は無効だし、顧客は通常即時にブラウザで注文ページを開いているはず。  
ただし Push 通知（顧客のブラウザに送る）はリアルタイムなので JWT 付き URL でも OK。

→ Push 通知: `/orders/{id}#t={jwt}` / メール: `/orders/{id}` の運用に。

---

## 9. テスト計画

### 単体テスト

| ファイル | 内容 |
|---|---|
| `tests/lib/customer-jwt.test.ts` | sign / verify ラウンドトリップ、TTL、claim 構造 |
| `tests/api/orders-action.test.ts` | createOrderAction が JWT を返す |
| `tests/api/webhook-stripe.test.ts` | email URL が JWT なし |

### Integration（実 Supabase 必須）

`tests/security/anon-rest-access.test.ts` の改修:
- 既存ガード `RUN_SECURITY_TESTS` を撤廃 → default で走る
- 「customer JWT で `/rest/v1/orders?id=eq.<own>` は 200」
- 「customer JWT で `/rest/v1/orders?id=eq.<other>` は 0 件」
- 「customer JWT で SELECT all は 0 件 or 1 件（自分のみ）」
- 「無 JWT / 無効 JWT で SELECT all は 0 件」

### E2E

- Playwright: 注文→決済→/orders/[id] 表示→Realtime 受信を verify
- 既存 spec の調整

---

## 10. デプロイ手順 / cutover

### 順序

1. **Step A**: コード変更を PR / merge（migration 含む）
2. **Step B**: Vercel deploy（main push で自動）
3. **Step C**: 適用前に local で `supabase db push --linked` 実行（本番 DB に migration 適用）
4. **Step D**: smoke test
   - `npm run test:security` で 0 fail（anon REST がすべて拒否）
   - 新規注文を 1 件作成 → JWT 付き URL → Realtime 動作確認
   - 古い URL（JWT なし）でアクセス → ページ表示 OK、Realtime は静かに失敗（30s ポーリングで更新）

### 順序の重要性

migration 適用と code deploy のタイミング:

- migration **先** 適用 → 古いコードでは Realtime が動かなくなる（一時的なダウン）
- code **先** deploy → 古い RLS では新コードの動作不明（テストで catch する想定）

**推奨**: migration と code を**同じデプロイサイクル**で適用。
1. PR / merge → main push（Vercel deploy 開始）
2. Vercel build 中に並行で `supabase db push --linked`
3. Vercel deploy 完了

短い「migration 適用済み / code 未 deploy」期間が生じるが、その間は古い client が anon SELECT を試行して 0 件返却 → ステータス画面の表示は server-side で出るので致命的でない。

---

## 11. Rollback 計画

### A. RLS だけ revert

```sql
-- 緊急時の rollback migration
CREATE POLICY "orders_public_select_by_uuid_TEMPORARY" ON public.orders
  FOR SELECT USING (true);
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.order_items TO anon;
```

これで F-18 を**意図的に再露出**して元に戻す。security regression test が即座に fail を返す。

### B. Code revert

`git revert <commit_sha>` で旧コードに戻す。client side は JWT 無し / 旧 fragment 無し URL でも動作。

### Rollback トリガー条件

- 顧客ステータスページが完全に表示できない（500 / blank）
- Realtime が `setSession` で全 client に対して失敗
- security test がいきなり PASS → FAIL に変わった（想定外）

---

## 12. Secret rotation 手順

`SUPABASE_JWT_SECRET` を rotation する場合:

1. **Supabase Dashboard → Project Settings → API → JWT Secret → Roll**
2. **新しい secret 値を Vercel env (`SUPABASE_JWT_SECRET`) に上書き**
3. **Redeploy**
4. **既存 JWT は全 invalidate**（新 secret で署名されていないため）
5. **その時点の active 注文の URL は Realtime 動かなくなる** → 30s ポーリングで動作継続

頻度: 通常運用では不要。漏洩疑い時のみ実施。

---

## 13. 残課題 / 議論ポイント

- **Q1**: TTL terminal+24h ロジックを RLS に組み込むか、`exp` 7 日 fixed で良いか
  - 推奨: fixed 7 日でスタート、UX 計測後に追加判断
- **Q2**: order_items の anon INSERT を REVOKE するか
  - 推奨: REVOKE（createOrderAction は service_role を使う、anon は不要）
- **Q3**: 既存注文の積極的 invalidate（push 通知で新 URL 配信）を行うか
  - 推奨: 行わない（「ページが見える / Realtime のみ静かに失敗」で実害なし、コスト見合いで Yes は別タスク化）
- **Q4**: email に JWT を含めるか
  - 推奨: 含めない（漏洩面増のリスク、メール時点で JWT 期限超過リスクあり）
- **Q5**: `jose` vs `jsonwebtoken` ライブラリ選択
  - 推奨: **jose**（Edge runtime 互換、Web Crypto API ベース、Vercel との相性◎）

---

## 14. 次のステップ

1. **このドキュメントへのユーザーレビュー / 承認**
2. Q1〜Q5 の最終判断
3. `SUPABASE_JWT_SECRET` を Supabase Dashboard で取得
4. backlog `#32` 着手 → 実装

---

## 関連ドキュメント

- `docs/security-review-2026-05-21.md` — F-18 の経緯と原因分析
- `docs/rls-review-checklist.md` — RLS ポリシー設計の原則
- `docs/workflow.md` — アーキテクチャ全体図
- `tests/security/anon-rest-access.test.ts` — 修正完了の客観的指標
