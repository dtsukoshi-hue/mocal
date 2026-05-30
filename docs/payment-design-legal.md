# 決済設計の法的整合性 — 設計と不変条件

> **本書の位置付け**: mocal の決済設計が日本の資金決済法上の問題を引き起こさないよう、コード / DB / 運用の各層に必要な不変条件を明文化した技術設計仕様書。
>
> 法的解釈の検証は、本書 + 実装コード + Stripe Connect 公式説明を含めた包括的なレビューが要る。読み手 (法務 / エンジニア / オーナー) いずれかの単独判断は推奨しない。引用法令の解釈は条文の文言と各引用元 (e-Gov / 裁判所 / 金融庁 等) を参照のこと。

---

## 1. 背景

- 2026-04-25 (initial commit `84303c2`) から `lib/payment.ts` に「`stripeConnectedAccountId` が未設定なら通常の charge を作成する」分岐が存在
- 2026-05-30 audit で、この分岐 + DB スキーマ NULL 許容 + 公開フィルタの不備が重なり、**mocal (Entrust) が販売者として顧客から代金を受領し、後で店舗に送金する経路** が成立し得ることが判明
- 現状 DB に該当 row が 1 件存在 (`stripe_account_id IS NULL` かつ `is_open=true`)
- test mode 運用中のため直接的な法的リスクは未発生だが、live mode 切替前に構造的に塞ぐ必要がある

過去事故と同型 (recovery-plan §4 「コードに動く分岐があれば本番運用で使える」と仮定する誤り) のため、ドキュメント化して再発防止する。

---

## 2. 法的前提

### 2.1 資金決済法 §37 — 資金移動業の登録

[資金決済に関する法律 — e-Gov 法令検索](https://laws.e-gov.go.jp/law/421AC0000000059) (法律番号: 平成 21 年法律第 59 号)

§37 (要旨): 銀行等以外の者は、§37-2 の登録を受けなければ、**為替取引を業として営んではならない**。

(2020 年改正以降、§37-2 で第一種〜第三種の登録区分が設けられた。少額 (5 万円以下) は第三種、中額は第二種、高額は第一種。区分に関わらず、登録なしの為替取引は禁止)

実際の条文は e-Gov の最新版を参照。

### 2.2 「為替取引」の定義

資金決済法自体に「為替取引」の明確な定義条項はない。判例 (§2.3) と銀行法上の用例から解釈される。

### 2.3 最高裁判決 平成 13 年 3 月 12 日 (民集 55 巻 2 号 97 頁) — 為替取引の範囲

[裁判所 — 判例検索](https://www.courts.go.jp/app/hanrei_jp/search1) で「平成 13 年 3 月 12 日」「為替取引」検索。出資法違反事件。

判決における「為替取引」の説明:
> 「顧客から、隔地者間で資金を移動する仕組みを利用して資金を移動することを内容とする依頼を受けて、これを引き受けること、又はこれを引き受けて遂行すること」

→ **「顧客から資金を受け取り、別の場所 / 別の者へ資金を移動する」行為**が為替取引に該当する、というのが最高裁の判示。

### 2.4 mocal が「mocal が販売者として顧客から代金を預かり、後で店舗へ送金する」モデルを取った場合

- 顧客 → mocal (Entrust) の決済アカウントへ全額入金
- mocal が後日、店舗に「売上 - 手数料」を送金
- これは隔地者 (顧客と店舗) 間の資金移動を mocal が引き受ける構造
- → §2 で定義される「為替取引」に**該当し得る**
- mocal (Entrust) は無登録 → §37 違反のリスク

### 2.5 「収納代行」モデルの解釈リスク

近年、Stripe / PayPal 等を介さず代理収納する事業に対し、金融庁が為替取引該当性を厳しく解釈する傾向にある (例: 2020 年改正 議論、関連 NBL 論文)。「単なる代理収納だから合法」という解釈は安全側ではない。

---

## 3. mocal が採用する決済モデル

### 3.1 採用: **Stripe Connect Standard + Destination Charges 一択**

- Stripe (Stripe Japan 株式会社 / Stripe Inc.) が日本の **資金移動業者登録済 / クレジットカード等決済代行業**として動く
- 各店舗は **Connect Standard アカウント**を保有 (= 各店舗が Stripe との独立した契約)
- 決済の構造:

```
顧客 →（カード決済）→ Stripe Platform Account (mocal/Entrust)
                              │ Destination Charges
                              │   - charge は platform に作成
                              │   - transfer_data.destination で店舗 Connect アカウントへ自動送金
                              │   - application_fee_amount で mocal が手数料受領
                              ▼
                       店舗の Connect アカウント（実質的な売上計上）
                              │
                              ▼
                       店舗の銀行口座（Stripe Payouts）
```

### 3.2 法的当事者の整理

| 役割 | 担い手 |
|---|---|
| 為替取引の実施者 | **Stripe (登録済)** |
| 販売業者 (商品提供者) | **各店舗** |
| プラットフォーム手数料の取次 | mocal (Entrust) ※ Stripe の application_fee 機構経由 |
| 顧客への領収書発行責任 | 各店舗 (Stripe が店舗名で発行) |
| 特商法表示の販売者 | 各店舗 (各店舗ページに特商法表示が必要) |
| チャージバック一次対応 | 各店舗 (Connect Standard の標準) |

### 3.3 「mocal が販売者になる経路」を一切作らない

`lib/payment.ts:46` の `if (stripeConnectedAccountId)` 分岐が NULL を許す現状は、上のモデルから逸脱し得る。この経路を構造的に塞ぐのが本書の主目的。

---

## 4. コード層の不変条件 — 5 重防御

| Layer | 場所 | 不変条件 | 違反検知 |
|---|---|---|---|
| **L1: DB 制約** | `supabase/migrations/<new>.sql` | `CHECK (NOT is_open OR stripe_account_id IS NOT NULL)` を `stores` に追加 | INSERT/UPDATE エラー |
| **L2: 公開フィルタ** | `lib/store-cache.ts`、`app/sitemap.ts`、`app/(store)/[slug]/page.tsx` | 公開対象は `is_open=true AND stripe_account_id IS NOT NULL` の店舗のみ | 顧客に表示されない (404) |
| **L3: 決済関数** | `lib/payment.ts` `createPayment` | `stripeConnectedAccountId` が falsy なら `throw new Error('店舗の Stripe Connect アカウントが未設定です')` | 注文 server action が 500、logger.error 経由で Sentry に通知 |
| **L4: admin 切替** | `app/api/admin/store/route.ts` (PATCH `is_open`) | `is_open=true` への変更時に `stripe_account_id IS NULL` なら 422 を返す | 管理画面でエラー表示 |
| **L5: onboarding UI** | `app/onboarding`、`app/admin/settings` | Connect 完了 = 「公開可能」の前提条件であることを UI 文言で明示 (現状の `welcome && !stripe_account_id` ガイドに依存しない、強い表示) | スタッフが正しい順序を理解 |

### 4.1 防御の独立性

5 層のうち 1 つでも作動すれば違法経路は成立しない。**いずれか単独に依存しない**:
- L1 が migration ミスで欠けても L2/L3 で防げる
- L2 が条件漏れでも L3 で防げる
- L3 が今後の refactor で外れても L4 で防げる
- 等々

### 4.2 修正対象 (本書承認後の Phase 4 コード PR)

A. `lib/payment.ts:46` `if (stripeConnectedAccountId)` → `if (!stripeConnectedAccountId) throw new Error(...)` に変更し、Connect 必須に  
B. `lib/payment.ts:72` `_stripeConnectedAccountId` 引数を関数シグネチャから削除 (将来の再導入リスクを構造的に防ぐ)  
C. migration で `stores` に CHECK 制約追加  
D. `lib/store-cache.ts` / `sitemap.ts` の select / フィルタに `stripe_account_id NOT NULL` 追加  
E. `app/api/admin/store/route.ts` で `is_open=true` 切替時のガード追加

---

## 5. 既存データの取扱い

- 現状 1 row (`3000DAYS BURGER 清澄白河本店`) が `stripe_account_id IS NULL` かつ `is_open=true`
- ただし **test mode 運用中** (`STRIPE_SECRET_KEY=sk_test_*`) のため実通貨取引は未発生 → 直接的な法的リスクは未発生
- live mode 切替 + Stripe Connect 設定完了の同タイミングで是正する想定
- 具体的是正方針 (是正案 A/B) は本書では確定しない。Stripe Connect サンドボックステスト完了後に別途判断

---

## 6. 監視・運用

- L3 throw は `lib/logger.ts` 経由で `logger.error('payment NULL connected account', ...)` → Sentry に通知 (SENTRY_DSN 設定済)
- Stripe webhook 失敗 (decline / dispute) は既存の `app/api/webhook/stripe/route.ts` で記録
- 「`stripe_account_id IS NULL` の store が `is_open=true` になっていないか」を定期確認 (将来 cron で自動化、当面は手動 SQL)

---

## 7. 未解決事項

- Stripe Connect サンドボックス設定 → ビジネスモデル選択 → live mode Connect 申請 (進行中、backlog #4 で track)
- 「Stripe Connect の利用規約」と「mocal 利用規約」の整合性確認 (店舗が Connect 契約を結ぶ前提が利用規約に明記されているか)
- 既存 1 row 是正の具体方針 (本書 §5)

---

## 8. 関連

- `AGENTS.md`
- `lib/payment.ts`
- `app/api/onboarding/stripe/callback/route.ts`
- `app/admin/settings/page.tsx`
- `lib/store-cache.ts`
- `app/sitemap.ts`
- `supabase/migrations/20260521013317_remote_schema.sql`
- `docs/backlog.md` (#4)
- `docs/workflow.md`
