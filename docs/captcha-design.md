# CAPTCHA 導入 設計ドキュメント (#33)

> **status**: 設計案 (実装未着手)  
> **作成日**: 2026-05-26  
> **目的**: pilot 完走後・本格運用開始前に anonymous sign-in に CAPTCHA を導入し、MAU 浪費攻撃 / DB 肥大攻撃から守る  
> **関連**: `docs/customer-auth-design.md` (#32 / #37 実装本体)、`lib/customer-session.ts`

---

## 1. 何から守るのか

### 攻撃シナリオ

| # | 攻撃 | 影響 | 検出難度 |
|---|---|---|---|
| A1 | 自動 script で `signInAnonymously` を大量発火 | Supabase MAU が無料枠 (50,000) を急速消費・課金跳ね上がり | 中（rate に出る） |
| A2 | 同 + 注文 submit まで進めて DB 行を埋める | `orders` / `order_items` 肥大、コスト跳ね上がり、運用 noise | 中 |
| A3 | 結合（A1+A2）+ Stripe テストカード未到達でも DB 直前まで行く | アプリケーション層で防げないとサービス品質低下 | 中 |
| A4 | お問い合わせ form (`/for-stores` 経由) の spam | 営業上の noise、`store_inquiries` 行肥大、メール通知 noise | 低（既に発生し得る） |

### 現状の防御層

| 層 | 何ができているか | 抜け |
|---|---|---|
| middleware (`proxy.ts`) | Server Action に 30 req/min/IP の generic rate limit (#36) | 分散 IP / 低速大量 (slow-loris) は通す |
| Supabase Auth | anonymous sign-in 自体には built-in rate limit あり (project setting 依存) | bot net には弱い |
| RLS (F-18 fix) | anon REST での全件 SELECT は閉じた | sign-in 後の自分自身行は当然見える（攻撃成立後） |

CAPTCHA は **A1〜A3 の入口（sign-in / submit のタイミング）** を bot から守る最後の蓋。

---

## 2. Provider 比較

| 観点 | hCaptcha | Cloudflare Turnstile | reCAPTCHA v3 |
|---|---|---|---|
| Supabase Auth ネイティブ統合 | ✅ あり | ✅ あり | ❌ (custom) |
| 無料枠 | 1M リクエスト/月 | **無制限** | 1M/月 |
| ユーザー操作 | チェックボックス〜画像選択 | **大半は invisible** | invisible (score 判定) |
| プライバシー | GDPR 配慮 | Cloudflare 内完結、第三者 cookie 無し | Google trackers 入る |
| 日本語 UI | あり | あり | あり |
| 失敗時の UX | やや煩雑 | スムーズ | スコア低だと無音で拒否 |

**選定: Cloudflare Turnstile**

理由:
1. **Supabase Auth ネイティブ統合あり** (`captchaToken` を `signInAnonymously` に渡せる)
2. **無料・無制限**（hCaptcha も 1M で十分だが上限が消える安心感）
3. **invisible 主体**で顧客 UX 阻害が最小
4. mocal は EU 顧客想定なし・国内中心だが、reCAPTCHA の trackers より privacy 上クリーン
5. Cloudflare アカウント不要のセットアップフローあり（site key / secret key だけで動く）

---

## 3. 実装方針

### 3.1 Supabase 側の設定

1. Supabase Dashboard → Authentication → Settings → **Bot and Abuse Protection**
2. **Enable Captcha protection** を ON
3. Provider: **Cloudflare Turnstile** を選択
4. **Site Key** / **Secret Key** を入力（後述 3.2 で取得）

これで `signInAnonymously` を含む全 auth エンドポイントが `captchaToken` 必須になる（未指定だと 400）。

### 3.2 Cloudflare Turnstile の準備

1. https://dash.cloudflare.com/?to=/:account/turnstile にサインアップ
2. **Add Site** → mocal-iota.vercel.app + localhost を登録
3. Widget mode: **Managed** (invisible 主体 + 必要時のみ challenge)
4. **Site Key** (`0x4AAA...`) と **Secret Key** (`0x4AAA...`) を取得
5. Supabase Dashboard に Secret Key を貼る (3.1)
6. `.env.local` / Vercel env に `NEXT_PUBLIC_TURNSTILE_SITE_KEY` を Site Key で登録（公開 OK）

### 3.3 フロント側 (Cart submit / 顧客 sign-in)

現状 (`app/actions/orders.ts` → `lib/customer-session.ts`) は **Server Action 内で `signInAnonymously` を発火**している。CAPTCHA token はクライアントから取得が必須なので、構造を以下に変更:

```
[顧客 Cart 画面]
  ↓ Turnstile widget マウント (NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  ↓ 顧客が 「お支払いへ」を押す
  ↓ Turnstile が token 発行 (invisible だが必要なら challenge)
  ↓ form data に turnstileToken を付けて Server Action 呼び出し
[createOrderAction]
  ↓ ensureCustomerSession(turnstileToken) — primitive を拡張
  ↓ supabase.auth.signInAnonymously({ options: { captchaToken: turnstileToken } })
  ↓ 既存処理
```

#### 影響ファイル

| ファイル | 変更 |
|---|---|
| `lib/customer-session.ts` | `ensureCustomerSession(captchaToken?: string)` に拡張、existing user があれば token 不要 |
| `app/actions/orders.ts` | `createOrderAction(formData)` で `formData.get('turnstileToken')` を取り出して渡す |
| `app/(store)/[slug]/_components/Cart.tsx` | Turnstile widget 埋め込み、token を hidden input に注入 |
| `lib/env.ts` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` を OPTIONAL に追加（local dev で無くても動作するように） |
| `.env.local.example` | 同上を記載 |

### 3.4 既存セッションありの場合

`ensureCustomerSession` は existing user があれば sign-in を skip するので、**2 回目以降の注文では CAPTCHA を出さない**設計。

ただし Cart UI 側で「既存セッション有無」を判定して widget をマウントするかは課題:
- A: 常にマウント (UX への影響は invisible なら最小)
- B: SSR 段階で getUser → 無いときだけマウント (RSC で props 分岐)

**推奨 B**。初回客のみ CAPTCHA、リピーターはノータッチ。

### 3.5 お問い合わせ form (`/for-stores`)

`app/actions/inquiries.ts` (#40 PR-A) も spam 流入口なので同じ仕組みを通す。anonymous sign-in は経由しないが、Turnstile token を server で直接検証する形にする:

```ts
// lib/turnstile.ts (新規)
export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean>
```

Server Action 冒頭で呼び、失敗時は 400 を返す。

---

## 4. 検証戦略

### 4.1 自動テスト

| テスト | 内容 |
|---|---|
| `tests/lib/customer-session.test.ts` 拡張 | `captchaToken` 引数が `signInAnonymously` に渡ることを mock で verify |
| `tests/lib/turnstile.test.ts` 新規 | Cloudflare verify API への POST が正しい body / siteverify URL であること |
| `tests/actions/orders.test.ts` 拡張 | formData に `turnstileToken` が無いと sign-in は呼ばれず error を返すこと（初回客のみ） |
| `tests/actions/inquiries.test.ts` 拡張 | お問い合わせ form の token 検証失敗で 400 |

### 4.2 手動 smoke

1. シークレットウィンドウで `/[slug]` を開く（既存セッション無し）
2. Cart に追加 → お支払い → Turnstile が invisible で通過 → Stripe へ
3. DevTools Network で `auth/v1/signup` の body に `captcha_token` が含まれることを確認
4. **Site Key を不正値に差し替えてリトライ** → submit が 400 で止まることを確認

### 4.3 攻撃シミュレーション

```bash
# CAPTCHA 無しで sign-in を叩いて 400 が返ることを確認
curl -X POST \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://<project>.supabase.co/auth/v1/signup?grant_type=anonymous
# → 400 "captcha protection: verification process failed"
```

---

## 5. 工数 / 実施順

| ステップ | 工数 | 備考 |
|---|---|---|
| Cloudflare Turnstile 登録 + Supabase 設定 | 30 分 | ユーザー作業 |
| `lib/turnstile.ts` 新規 + tests | 1 時間 | server-side verify primitive |
| `lib/customer-session.ts` 拡張 + tests | 1 時間 | captchaToken オプション引数 |
| Cart.tsx に widget 埋め込み | 1 時間 | RSC で SSR getUser → 必要時のみマウント |
| お問い合わせ form 対応 | 30 分 | inquiries.ts に verify 追加 |
| 手動 smoke + 攻撃シミュ | 1 時間 | 本番 env 反映後 |
| **合計** | **約 1 日** | backlog #33 見積もりと一致 |

---

## 6. 実施タイミング

> backlog #33: "pilot 期は省略可、本格運用前に必須"

pilot (1 店舗目の実証実験) 期間中は不要。**実証実験完走 → 本格 onboarding 開始の直前**に着手。それまではこのドキュメントを保持。

実施前チェック:
- [ ] `lib/customer-session.ts` が #37 refactor 後の状態か（OK）
- [ ] お問い合わせ form (#40) が main にいるか（OK）
- [ ] Supabase plan が Pro 移行済か（Bot Protection は free でも使えるが、MAU 跳ね上がりを許容できる経済前提か）

---

## 7. 関連

- `docs/customer-auth-design.md` — 顧客認証本体の設計（#32 / #37）
- `docs/rls-review-checklist.md` — RLS との関係
- `lib/customer-session.ts` — 拡張対象の primitive
- `app/actions/orders.ts` / `app/actions/inquiries.ts` — token 経由する Server Action
