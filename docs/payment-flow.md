# mocal 決済フロー — A/B/C 3 枚

> Phase 4a 完了 (PR #35) + Phase 4c 改善予定 を反映した実装ベースの図。
> 関連: `docs/payment-design-legal.md` / `lib/payment.ts` / `app/api/webhook/stripe/route.ts`

---

## A. Happy Path 決済フロー

```
顧客           mocal                                  Stripe
─────         ─────────                              ──────

❶ /[slug]    getCachedStore(slug)
   表示       ├─ WHERE slug=?
              └─ WHERE stripe_account_id IS NOT NULL  ← L2 公開フィルタ
                                                        (is_open は SELECT で取得、
                                                         表示制御に使用するが
                                                         WHERE には使わない)

❷ 注文確認   createOrderAction (server action)
   送信       ├─ stores SELECT (is_open / wait_minutes / stripe_account_id)
              ├─ if (!is_open)             return error
              ├─ if (!stripe_account_id)   return error    ← L6 action 層 NULL check
              ├─ orders.insert (status='pending')
              ├─ createPayment(amount, orderId, store.stripe_account_id, email)
              │   ├─ if (!stripe_account_id) throw          ← L3 ガード
              │   └─ paymentIntents.create({
              │        amount,
              │        currency: 'jpy',
              │        metadata: { order_id },
              │        automatic_payment_methods: { enabled: true },  ← Apple Pay / Google Pay
              │        application_fee_amount: 6.4%,
              │        transfer_data: { destination: acct_xxx },
              │        receipt_email (optional),
              │        // Phase 4c PR-B 後: on_behalf_of: acct_xxx 追加予定
              │      })   ─────────────────────→ Platform Account (Entrust) で
              │                                   PaymentIntent 作成
              └─ orders.update(stripe_payment_intent_id=pi_xxx)
                 → clientSecret 返却

❸ Element    Stripe.js が clientSecret を使って Stripe API へ直送信
   カード入力 (Stripe Connect の licensed infrastructure 経由)
                                                       ❹ 決済処理 → succeeded

❺ /orders/    Webhook /api/webhook/stripe ←──── payment_intent.succeeded
   [id]       ├─ verify signature
   状況確認   ├─ orders + order_items + stores SELECT
              ├─ amountMatch check (intent.amount === order.total_amount)
              ├─ if (!store.is_open OR !amountMatch) → 自動 cancel+refund (→ 図 B)
              ├─ charges.retrieve (receipt_url 取得)
              ├─ orders.update(
              │    status='paid',
              │    stripe_charge_id=ch_xxx,
              │    stripe_receipt_url=...)
              ├─ notifyStore (新規注文) / notifyOrder
              └─ (後続: store による 受理 / ready 操作で sendOrderStatusEmail via Resend)

                                                       ❻ 資金分配 (Stripe 内、瞬時)
                                                          Platform Account +1000
                                                            ├ application_fee: 64 を保留
                                                            └ transfer: 936 → Connected
                                                          Connected Account +936

                                                       ❼ Payout (各 account 独立設定)
                                                          店舗の銀行口座
                                                            (Stripe Connect Standard の標準)
                                                          Entrust の銀行口座
                                                            (三井住友 ****1914、週次月曜、
                                                             application_fee 合計分)
```

---

## B. 失敗 / 返金フロー

```
発生源                処理                                                  最終 status
─────                ─────                                                  ──────

[1] 顧客 cancel       POST /api/orders/[id]/cancel                          refunded
    paid 状態の       ├─ rate limit (5/min/IP)                                or
    自発キャンセル    ├─ Supabase Auth: auth.uid() === order.user_id        cancelled
                      ├─ status check: paid のみ可 (それ以外は 422)            (refund 失敗時、
                      ├─ if (stripe_charge_id):                                手動対応)
                      │    refundPayment(charge) → Stripe refunds.create
                      │    nextStatus = 'refunded'
                      ├─ orders.update(
                      │    status=nextStatus,
                      │    cancelled_reason_type='user_cancel')
                      ├─ sendPushToOrder('注文をキャンセルしました')
                      └─ (後続) webhook charge.refunded で再 sync

[2] 店舗 cancel       PATCH /api/orders/[id] (status='cancelled' を送信)    refunded
    管理画面から      ├─ store member auth check (owner / staff)              or
                      ├─ status transition check (lib/validation.ts)         cancelled
                      ├─ orders.update(
                      │    status='cancelled',
                      │    cancelled_reason_type='store_cancel'
                      │                       | 'out_of_stock')
                      ├─ (if stripe_charge_id):
                      │    refundPayment → status='refunded' (別 update)
                      ├─ notifyOrder('キャンセル・返金のお知らせ')
                      └─ sendOrderStatusEmail (Resend、'cancelled' or 'refunded')

[3] 外部返金          Stripe Dashboard / Stripe API で手動 refund           refunded
    Stripe 側         ↓
                      Webhook charge.refunded ──→ /api/webhook/stripe
                      ├─ verify signature
                      ├─ orders SELECT (stripe_charge_id 経由)
                      ├─ orders.update(status='refunded')
                      │   ※ neq('status', 'refunded') で冪等
                      └─ notifyOrder('返金処理が完了しました')

[4] 決済失敗          Stripe 側カード認証失敗 / 残高不足等                  cancelled
    Stripe 側         ↓
                      Webhook payment_intent.payment_failed
                      ──→ /api/webhook/stripe
                      ├─ verify signature
                      ├─ orders SELECT (stripe_payment_intent_id 経由)
                      ├─ orders.update(
                      │    status='cancelled',
                      │    cancelled_reason_type='payment_failed')

[5] webhook 内        payment_intent.succeeded handler 内                  refunded
    自動キャンセル    ├─ stores SELECT (is_open)                              or
    +返金             ├─ amountMatch check                                   cancelled
    発生条件:         └─ if (!store.is_open OR !amountMatch):                  (refund 失敗時)
    - 店舗閉店            ├─ orders.update(
    - 金額不一致          │    status='cancelled',
                          │    cancelled_reason_type=
                          │      'amount_mismatch' or 'store_closed')
                          └─ if (chargeId):
                               refundPayment(chargeId)
                               orders.update(status='refunded',
                                             stripe_charge_id=chargeId)

[6] PI 作成失敗       createOrderAction (app/actions/orders.ts:325-342)   cancelled
                      ├─ orders.insert (status='pending')
                      ├─ createPayment(...) throw
                      └─ orders.update(
                           status='cancelled',
                           cancelled_reason_type='payment_failed')
                      ※ charge 未作成のため refund 不要

[6'] order_items      createOrderAction (app/actions/orders.ts:308-318)   cancelled
     insert 失敗      ├─ orders.insert (status='pending')
                      ├─ order_items.insert error
                      └─ orders.update(
                           status='cancelled',
                           cancelled_reason_type='timeout')
                      ※ charge 未作成のため refund 不要

[7] no_show           cron /api/cron/no-show (1 分間隔)                    no_show
    受取期限切れ      ├─ status='ready' AND ready_at < (now - 15min)
                      ├─ orders.update(status='no_show', no_show_at=now)
                      └─ notifyOrder (顧客) + notifyStore (店舗)

[8] pending タイム    同 cron /api/cron/no-show 内                          cancelled
    アウト            ├─ status='pending' AND created_at < (now - 30min)
    PI 確定せず       └─ orders.update(
    30 分以上              status='cancelled',
                           cancelled_reason_type='timeout')
                      ※ 返金不要 (charge 未作成のため)
```

---

## C. 法的当事者 + 5 重防御

```
法的当事者整理 (現状 vs Phase 4c 完了後)
═══════════════════════════════════════════════════════════════════════

                      現状 (PR #35 まで)               Phase 4c 完了後 (PR-A/B/E/F)
                      ─────────────────                ────────────────────────
カード明細表示先      mocal/Entrust                    各店舗名
                      (Stripe Element の               (on_behalf_of 設定で
                       statement_descriptor)            店舗名で明細表示)

Stripe 上 merchant    mocal (Platform Account)         各店舗 (Connected Account)
of record (charge)    on_behalf_of 未設定              on_behalf_of=acct_xxx 設定

商品の販売者          業務設計上は店舗、しかし         各店舗 (法的にも合致)
                      card transaction では mocal が
                      merchant となる乖離あり

特商法表示の販売者    mocal /tokushoho                 - mocal は取次事業者として
                      Entrust = 販売者 (実装乖離)        記載 (PR-F で改訂)
                                                        - 各店舗が自社サイトに特商法
                                                          表示 (#36 で URL 入力可)
                                                        - mocal 店舗ページから
                                                          外部リンク (PR-E)

チャージバック責任    mocal (Stripe 上の merchant)     各店舗 (Stripe Connect
                                                        Standard の標準)

application_fee       mocal (Entrust) 6.4%             同左
の受領

為替取引該当性        Destination Charges + Connect    on_behalf_of 設定で更に
                      で Stripe の licensed infra      明確化、最終法的判断は
                      経由、解釈余地あり               弁護士確認推奨

═══════════════════════════════════════════════════════════════════════

5 重防御 (NULL stripe_account_id を全層で阻止) — defense in depth
═══════════════════════════════════════════════════════════════════════

L1: DB CHECK 制約                                       ⏳ Phase 4b (#50)
    stores テーブルに以下を追加予定:
      CHECK (NOT is_open OR stripe_account_id IS NOT NULL)
    既存 1 row (NULL + is_open=true) 是正後に migration 適用。

L2: 公開フィルタ                                        ✅ Phase 4a (#35)
    - lib/store-cache.ts getCachedStore / getCachedStoreMeta:
      .not('stripe_account_id', 'is', null) で NULL 除外
    - app/sitemap.ts:
      .eq('is_open', true) + .not('stripe_account_id', 'is', null)
    NULL 店舗は顧客に発見されない (slug 直 URL でも 404)。

L3: createPayment() の throw                            ✅ Phase 4a (#35)
    lib/payment.ts:48
      if (!stripeConnectedAccountId) throw new Error(...)
    引数の型を null/undefined 許容、関数内で必ず弾く。

L4: admin /api/admin/store PATCH ガード                 ✅ Phase 4a (#35)
    is_open=true への切替時に stripe_account_id IS NULL なら
    422 + code: 'connect_required' を返す。

L5: admin/settings UI                                   ✅ Phase 4a (#35)
    「Stripe 決済連携 (必須)」「未接続なら公開できません」を
    red 強調 + 文言で明示。

L6: action 層チェック (createOrderAction)               ✅ 既存実装
    app/actions/orders.ts:133-135
      if (!store.is_open)            return error
      if (!store.stripe_account_id)  return error
    UI / cache を経由しない API 直叩きでも防御。

───────────────────────────────────────────────────────────────────────

5 重防御では塞げない / 別途検討要のリスク
──────────────────────────────────────────

(M1) Connect アカウント無効化への動的対応
     stripe_account_id が SET されているが、当該 Connect account が後に
     suspended / restricted になった場合は 5 重防御では弾けない。
     対応案:
       - Stripe webhook `account.application.deauthorized` /
         `account.updated` を購読して stripe_account_id を NULL にする
       - 決済前に accounts.retrieve で last_check (TTL cache)
     現状 mocal は未対応。pilot 開始後の運用で判断。

(M2) failure / refund パスの test coverage
     図 B の 8 経路のうち、payment_intent.payment_failed / charge.refunded
     等の test が手薄である可能性。Phase 4c 後に test 追加 audit。

```

---

## 関連

- `docs/payment-design-legal.md` — 法的設計の本体 (Phase 4c PR-A で §3 改訂予定)
- `lib/payment.ts` — createPayment / refundPayment 実装
- `app/api/webhook/stripe/route.ts` — 3 種 webhook handler
- `app/api/orders/[id]/cancel/route.ts` — 顧客 cancel
- `app/api/orders/[id]/route.ts` — 店舗 cancel (PATCH)
- `app/actions/orders.ts` — createOrderAction (注文作成 / PI 作成)
