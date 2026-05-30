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

### 3.1 採用: **Stripe Connect Standard + Destination Charges + `on_behalf_of` (取次事業者モデル)**

- Stripe は日本国内で**カード決済の処理サービスを提供する事業者** (Stripe Japan 株式会社 / Stripe Inc. の役割分担は公式情報の確認待ち、§7)。具体的な法的登録区分 (資金移動業 / 包括加盟店契約 / クレジットカード等決済代行業 等) の一次出典は §7 に未解決事項として記録。本書は「Stripe が licensed infrastructure を提供している」事実のみを前提とし、具体的登録区分は断定しない。
- 各店舗は **Connect Standard アカウント**を保有 (Stripe Connect Service Agreement: https://stripe.com/jp/connect-account/legal — 店舗と Stripe の契約関係はこの規約に基づく)
- mocal (Entrust) は Platform Account を保有、**取次事業者**として決済導線を整備し、`application_fee` を受領する

決済の構造 (Phase 4c 完了後の目標形、詳細フロー図は `docs/payment-flow.md` 図 A 参照):

- PaymentIntent を Platform Account (mocal/Entrust) で作成、`transfer_data.destination` = 店舗 Connect account に売上計上
- `application_fee_amount` = 6.4% を mocal が受領 (`lib/payment.ts` の `MOCAL_FEE_RATE`)
- `on_behalf_of` = 店舗 Connect account ← Phase 4c PR-B で追加予定
- 上記により Stripe 上の merchant of record / 売上計上 が**店舗**に統一される。カード明細の `statement_descriptor` の最終的な見え方は Stripe Connect 規約 / 各 Connect アカウントの設定に依存
- Payout は店舗 / mocal の各 Connect account 独立設定 (Stripe Connect Standard の標準仕様、各アカウントの設定に依存)

現状 (Phase 4a まで) は `on_behalf_of` 未設定で、Stripe 上の merchant of record が mocal となる表示が残る。Phase 4c PR-B で是正。

### 3.2 法的当事者の整理 (現状 vs Phase 4c 完了後)

`docs/payment-flow.md` 図 C と同一の整理 (本書 = 設計、payment-flow = 実装ベースの図、で 1:1 対応)。

| 項目 | 現状 (PR #35 まで) | Phase 4c 完了後 (PR-A/B/E/F) |
|---|---|---|
| カード明細表示先 (statement_descriptor) | mocal / Entrust | **各店舗名** (PR-B `on_behalf_of`) |
| Stripe 上 merchant of record (charge) | mocal (Platform Account) | **各店舗 (Connected Account)** (PR-B `on_behalf_of`) |
| 為替取引該当性の主体 | Stripe の licensed infrastructure 経由、解釈余地あり (※) | 同左 + `on_behalf_of` で更に明確化 |
| 商品の販売者 (業務設計) | 各店舗 | 各店舗 |
| 商品の販売者 (Stripe 上の見え方) | mocal が merchant となる乖離あり | **各店舗 (法的にも合致)** |
| 顧客への領収書発行 | mocal 名で発行 (※) | **各店舗名で発行** (※ Stripe の receipt 発行ルールは Connect 規約 / Dashboard 設定に依存、PR-B 完了後に実機で再確認) |
| 特商法表示の販売者 | mocal `/tokushoho` が事実上の表示元 (#36 で `stores.tokushoho_url` 追加済、未表示) | **各店舗** (PR-E 店舗ページから外部リンク表示 / PR-F mocal `/tokushoho` を取次事業者表記に改訂) |
| アレルゲン表示の責任 | 各店舗 (未導線化) | **各店舗** (PR-E `stores.allergen_url` 表示) |
| チャージバック責任 | mocal (Stripe 上の merchant) | **各店舗** (Connect Standard 標準) |
| `application_fee` 受領 | mocal (Entrust) 6.4% | 同左 |
| 最終的な為替取引該当性の法的判断 | 弁護士確認推奨 | 同左 (PR-A/B/E/F 完了後に再確認推奨) |

(※) 為替取引該当性: §2.3 最高裁判決の定義に対し、Stripe Connect Destination Charges (+ `on_behalf_of`) では「顧客が直接店舗に対して支払い、Stripe が店舗のために処理する」構造として整理可能。ただし最終的な該当性判断は本書のスコープ外。

### 3.3 mocal の役割 = **取次事業者** (場と決済導線の提供)

mocal (Entrust) は商品の販売者ではなく、**取次事業者**として以下のみを担う:

| 担う | 担わない |
|---|---|
| 店舗の Connect onboarding 必須化 (5 重防御で構造的に強制) | 商品契約の当事者 (顧客と店舗の間の売買契約) |
| Stripe を介した決済導線の提供 | 特商法上の販売者 (各店舗自身が表示責任を負う) |
| 注文 → 受取 の UI / 通知 / status 管理 | 領収書発行責任 (Stripe が店舗名で発行) |
| 取次手数料 (`application_fee` 6.4%) の受領 | チャージバック一次対応 (Connect Standard 標準で店舗) |
| 場のルール (運用規約 / 利用規約) の整備 | 商品在庫 / 価格 / 品質保証 |

この役割整理は Phase 4c 完了 (PR-A/B/E/F merged) 時点で **コード / Stripe 設定 / UI 表記 / `/tokushoho` 表記** の全てに反映される。

### 3.4 「mocal が販売者になる経路」を一切作らない (5 重防御)

`lib/payment.ts` の `createPayment` 関数には initial commit から「`stripeConnectedAccountId` が未設定なら通常の charge を作成する」分岐が存在し、§3.3 で整理した取次事業者の役割から逸脱する経路を生んでいた。

- **Phase 4a (#35) で throw 化済**: 関数冒頭で `if (!stripeConnectedAccountId) throw` を行い、Connect 未接続を強制エラーに (現状の実装は `lib/payment.ts` 参照、行番号は drift するため引用しない)
- **5 重防御** (§4) で各層に独立した防御を入れ、L1〜L5 のいずれか単独に依存しない設計
- **Phase 4c PR-B** で `on_behalf_of` を追加し、Stripe 側の merchant of record も店舗に一致させる

これらにより、mocal が販売者として代金を受領する経路は (a) コード上 throw、(b) Stripe 上も店舗 merchant、の二重で塞がれる。

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

A. `lib/payment.ts` `createPayment` 関数で `if (stripeConnectedAccountId)` 分岐を排し、未設定なら `throw new Error(...)` で Connect 必須に (Phase 4a #35 完了)
B. migration で `stores` に CHECK 制約追加 (Phase 4b #50 予定)
C. `lib/store-cache.ts` / `sitemap.ts` の select / フィルタに `stripe_account_id NOT NULL` 追加 (Phase 4a #35 完了)
D. `app/api/admin/store/route.ts` で `is_open=true` 切替時のガード追加 (Phase 4a #35 完了)
E. `lib/payment.ts` `paymentIntents.create` に `on_behalf_of: stripeConnectedAccountId` 追加 — Stripe 上の merchant of record を店舗に一致させる (Phase 4c PR-B 予定、本書 §3.1 / §3.2 と整合)

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

- Stripe Connect サンドボックス設定 → ビジネスモデル選択 → live mode Connect 申請 (進行中、backlog #47 で track)
- 「Stripe Connect の利用規約」と「mocal 利用規約」の整合性確認 (店舗が Connect 契約を結ぶ前提が利用規約に明記されているか)
- 既存 1 row 是正の具体方針 (本書 §5)
- **Stripe Japan 株式会社 / Stripe Inc. の日本国内における具体的な法的登録区分の一次出典確認** (§3.1 で断定を避けたため。資金移動業者登録 / 包括加盟店契約 / クレジットカード等決済代行業 等のいずれに該当するかを Stripe の公式 IR / 開示 / 利用規約から特定)
- Phase 4c (PR-A/B/E/F) 全完了後の為替取引該当性 / 特商法位置付けの法的判断 (弁護士確認推奨、§3.2 末尾)

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
