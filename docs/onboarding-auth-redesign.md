# Onboarding & Auth 基盤再設計 (v4 / 2026-06-03)

## 背景

2026-06-03 セッションで `R2: テスト店舗を live mode で新規作成` 着手時に、現行 onboarding フローの構造的欠陥を 4 件発見:

1. **新規 onboarding**: `app/actions/onboarding.ts:53-55` で `signUp` が session を返さない (Supabase Auth `Confirm email` ON) と早期 return → 店舗データが永久に作られない
2. **staff invite** (`app/admin/members/_components/InviteStaffForm.tsx`): 「事前に mocal に登録済みである必要があります」と仕様化されている = 招待される側が `/onboarding` で別店舗を作ってから招待リンクを踏む必要 → 構造的に動かない
3. **Email sender**: Supabase default SMTP (`noreply@mail.app.supabase.io`) → SPF/DKIM 通過せず spam 入り / フィッシング警告
4. **Email template**: Supabase 英語デフォルト → ブランド統一なし

加えて以下の拡張性懸念:
- `signUp` が既存 email を「already registered」で reject → 1 user が複数店舗を持つフロー不可 (schema 自体は `store_members.UNIQUE(store_id, user_id)` で対応済なのに表面で塞いでいる)
- bounce/complaint 検知なし → メール届かない user を放置
- store_members 変更の audit log なし → multi-tenant 運用で誰がいつ owner を外したか追えない
- slug 予約語チェックなし → `/admin` 等の app route と衝突可能

これらは **pilot 開始の R2 ブロッカー** であると同時に、**multi-tenant 基盤の根本欠陥**。pilot 1 店舗で動いても 2 店舗目で必ず破綻するため、pilot 開始前に基盤として正しく作り直す。

## 原則

- pilot タイムラインは劣後、設計の正しさ・拡張性を優先
- 「動く」ではなく「美しい・シンプル・無駄なし・拡張性高い」を満たす
- 不確定要素 (将来要件) で必ず修正が入る前提で、修正コストが低い形にしておく
- AGENTS.md の RLS / 決済 / destructive 操作の原則を全て守る

## 全体構造 (after)

```
[新規 signup]                       [staff invite]
  POST /onboarding                    POST /admin/members/invite
       │ signUp + pending_signups          │ pending_invitations insert
       │ upsert                            │ + sendEmail (lib/email.ts)
       ▼                                   ▼
  Resend (mocal.jp) で確認メール送信     Resend (mocal.jp) で招待メール送信
       │                                   │
       ▼                                   ▼
  GET /auth/confirm                    GET /auth/invite-accept?token=
       │ verifyOtp                          │ token 検証 (DB lookup)
       │ → session                          │ → 既存 user: signIn / 新規: signUp
       │ → rpc(create_store_with_owner)     │ → store_members insert
       ▼                                   ▼
  /admin/settings?welcome=1            /admin/dashboard
```

`/auth/confirm` は signup と invite を `type` で分岐し共通化。

## 影響範囲

### 既存ファイル変更
- `app/actions/onboarding.ts` — 全面書き換え
- `app/onboarding/page.tsx` — query 対応 (error / resume / prefill) + 多店舗対応 (ログイン中時の分岐)
- `app/admin/members/_components/InviteStaffForm.tsx` + `app/actions/members.ts` — 「事前登録必須」を廃止、メール送信 invite に変更
- `app/actions/auth.ts` — login/reset rate limit + Sentry
- `lib/email.ts` — 招待メール用 helper 追加
- `lib/env.ts` — `RESEND_WEBHOOK_SECRET` 追加

### 新規ファイル
- `supabase/migrations/<ts>_create_pending_signups_and_rpc.sql`
- `supabase/migrations/<ts>_create_pending_invitations.sql`
- `supabase/migrations/<ts>_create_store_member_events.sql`
- `app/auth/confirm/route.ts`
- `app/auth/invite-accept/route.ts`
- `app/api/webhook/resend/route.ts`
- `lib/slug-reservation.ts`
- `lib/rate-limit-auth.ts` (Upstash wrapper、auth 系 endpoint 用)
- `docs/email-templates/{confirm-signup,invite,reset-password,change-email,reauthentication}.html`
- `docs/email-templates/README.md` (Dashboard へ paste する canonical 運用)

### 廃止
- `app/actions/onboarding.ts` の早期 return `if (!authData.session)` パターン
- Supabase default SMTP / 英語テンプレ依存

## PR 分割 (7 PR、依存順)

### PR-1: Resend SMTP + 5 branded templates (基盤)

**目的**: すべての auth メールが `support@mocal.jp` ドメインから branded で届く状態を作る。

**Code 変更**: 5 種 template HTML を `docs/email-templates/` に commit + README

**User 作業 (1h)**:
- Supabase Auth → SMTP Settings: `smtp.resend.com` / 587 / `resend` / `RESEND_API_KEY` / `support@mocal.jp` / `mocal`
- Email Templates 5 種に上記 HTML を paste
- URL Configuration → Redirect URLs:
  - `https://mocal.jp/auth/confirm`
  - `https://mocal.jp/auth/invite-accept`
  - `https://mocal.jp/admin/reset-password`
  - `http://localhost:3000/**` (dev)
- DNS で `_dmarc.mocal.jp` の policy 確認 (`p=none` なら別 PR で `p=quarantine` 推奨)
- 自分宛 sign up テスト → 5 種テンプレが branded で届くか目視

### PR-2: Onboarding 再設計 + 多店舗対応

**新規 migration**: `pending_signups` テーブル + `create_store_with_owner` RPC

```sql
CREATE TABLE pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  error_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id)
);
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;
-- service role only。anon/authenticated に GRANT しない (= 不可)

CREATE FUNCTION create_store_with_owner(p_name text, p_slug text, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_store_id uuid;
BEGIN
  INSERT INTO stores (name, slug) VALUES (p_name, lower(trim(p_slug)))
    RETURNING id INTO v_store_id;
  INSERT INTO store_members (store_id, user_id, role)
    VALUES (v_store_id, p_user_id, 'owner');
  RETURN v_store_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
END $$;
REVOKE ALL ON FUNCTION create_store_with_owner FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_store_with_owner TO service_role;
```

**`lib/slug-reservation.ts`**:
```ts
const RESERVED = new Set([
  'admin','api','auth','onboarding','tokushoho','privacy','inquiries',
  'www','app','dashboard','help','support','blog','docs','_next','static','public'
])
export function isSlugReserved(slug: string): boolean
```

**`app/actions/onboarding.ts`** 2 mode 対応:
- **未ログイン (新規 signup)**: slug 形式 + reserved + 事前 SELECT 重複 check → `signUp({..., options: { emailRedirectTo: 'https://mocal.jp/auth/confirm?next=/admin/settings' }})` → `pending_signups` UPSERT (status=pending) → `return { ok: true, sent: email }`
- **ログイン中 (多店舗追加)**: signUp skip → `pending_signups` UPSERT → 直接 `create_store_with_owner` RPC → `redirect('/admin/settings?welcome=1&store_id=...')`
- Sentry capture (tag `flow: onboarding-register`)
- Upstash rate limit (5 req/min/IP)

**`app/auth/confirm/route.ts`** (GET):
- `Cache-Control: no-store`
- token_hash / type を query から取得 (Sentry には流さない)
- `supabase.auth.verifyOtp({ token_hash, type })` で session 確立
- `type === 'signup'`:
  - `pending_signups` SELECT で row 取り
  - service client で `rpc('create_store_with_owner', { ... })`
  - 成功: `pending_signups.status='completed'` + `completed_at` + `redirect(next)`
  - `slug_taken`: `pending_signups.error_count++` + `redirect('/onboarding?error=slug_taken&name=<prefill>')`
  - その他: `status='failed'` + `last_error` + Sentry capture + `redirect('/onboarding?error=server&resume=1')`
  - token expired/invalid: `redirect('/onboarding?error=expired')`
- `type === 'invite'`: PR-4 で実装 (本 PR では未対応で `redirect('/admin/dashboard')`)
- idempotent: 同 token を 2 度踏んでも `pending_signups.status === 'completed'` なら `verifyOtp` skip + 直接 `next` へ redirect

**`app/onboarding/page.tsx`** 改修:
- `useSearchParams` で `error` / `resume` / `name` を読む
- 上部 banner で error 表示、`name` で店舗名 input prefill
- `resume=1`: server-side でログイン状態 + `pending_signups` row 存在を確認 → 「店舗作成を再試行」ボタン (action でその場で RPC 呼ぶ、verifyOtp 不要)
- ログイン中 user 訪問時: 「別店舗を追加します」サブヘッダ + 既存店舗一覧リンク
- 確認メール送信後 (`ok: true`): 同 page 内で「`<email>` に確認メールを送信しました…」 + 再送ボタン

**回帰テスト**: 既存 `3000DAYS` 店舗の admin login が壊れていないこと

### PR-3: Auth endpoint rate limit + Sentry

- `/admin/login` (`app/actions/auth.ts`): Upstash rate limit per IP + per email (5 failures → 5 min lockout)
- `/admin/reset-password`: rate limit per email
- `/auth/confirm`: rate limit per IP (token brute force defense in depth、Supabase 側でも throttling あり)
- すべての auth 系 endpoint に Sentry tag (`flow: admin-login` / `password-reset` / `onboarding-confirm`)

### PR-4: Staff invite 再設計 (自前 token)

Supabase invite は使わない (`auth.admin.inviteUserByEmail` の `data` が user_metadata 行きで改竄可能 = `invited_to_store_id` 偽造リスク)。

**新規 migration**: `pending_invitations`
```sql
CREATE TABLE pending_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('staff', 'owner')),
  token text NOT NULL UNIQUE, -- 32-byte hex
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz
);
-- 同店舗・同 email の pending は 1 件まで (partial unique)
CREATE UNIQUE INDEX pending_invitations_active_idx
  ON pending_invitations (store_id, email)
  WHERE status = 'pending';
ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;
-- service role only
```

**`app/actions/invite.ts`** (新規 or `app/actions/members.ts` 改修):
- crypto.randomBytes(32).toString('hex') で token 生成
- `pending_invitations` insert
- `lib/email.ts` の `sendEmail()` で mocal ドメインから招待リンク送信 (URL: `https://mocal.jp/auth/invite-accept?token=<token>`)

**`app/auth/invite-accept/route.ts`** (GET) + 対応 page:
- token 検証 (`pending_invitations` SELECT, status='pending' + not expired)
- 未ログイン: sign up 画面 (password 入力) → email は invitation.email 強制
- ログイン中: email が invitation.email と一致確認 (異なれば logout 促す)
- 成功: `store_members` insert + `pending_invitations.status='accepted'` + `accepted_at`
- 失敗: `expired` / `revoked` / `email_mismatch` 等を error code で表示

**`InviteStaffForm`** 改修: 「事前登録必須」廃止、email 入力だけで OK

### PR-5: Resend webhook (deliverability)

**Resend Dashboard** で webhook 登録 (`https://mocal.jp/api/webhook/resend`、signing secret は `RESEND_WEBHOOK_SECRET`)

**`app/api/webhook/resend/route.ts`** (POST):
- Svix signature 検証
- event type:
  - `email.bounced` / `email.complained`: Sentry breadcrumb (level=warning) + `auth.users.user_metadata.email_delivery_status = 'bounced'` (将来 admin UI で警告表示用)
  - `email.delivered`: 統計のみ (DB 記録不要)
- 失敗 event だけログを残す方針 (volume 制御)

### PR-6: store_member audit log

**新規 migration**: `store_member_events`
```sql
CREATE TABLE store_member_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id), -- NULL = system
  target_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (event_type IN ('added', 'removed', 'role_changed')),
  role_before text,
  role_after text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: store の owner だけが SELECT 可、INSERT は service role only
```

既存 add/remove actions に insert を追加。UI は本 PR 範囲外 (後続 backlog)。

### PR-7: Tests + docs + backlog 整理

- vitest: 各 PR の test ファイル (~40 件追加目安)
- `docs/customer-auth-design.md` を「顧客 anon + 店舗オーナー auth + staff invite 統合設計書」に書き換え (現状は顧客中心)
- `docs/workflow.md` の図に `/auth/confirm` `/auth/invite-accept` `pending_signups` `pending_invitations` ノード追加
- `docs/email-templates/README.md` 完成 (canonical 運用ルール: commit が真、Dashboard は apply 先)
- backlog: 完了済の PR-1〜6 を [x] 化、関連 backlog (#10 顧客ログイン, #17 マルチ店舗) との依存関係明記

## 失敗モード網羅

| # | シナリオ | 対応 |
|---|---|---|
| 1 | slug 事前 OK → callback 時に重複 (race) | `/onboarding?error=slug_taken&name=...` で別 slug 入力。`pending_signups.error_count++` で記録 |
| 2 | 確認メール届かない / spam | PR-1 で SPF/DKIM 通過、`/onboarding` で再送ボタン、PR-5 で bounce 検知 |
| 3 | 確認リンク expired (24h Supabase default) | callback で `redirect('/onboarding?error=expired')` → 再 sign up promote |
| 4 | 確認リンクを別ブラウザで開く | `verifyOtp` がそのブラウザに session cookie 発行 = OK |
| 5 | 確認後に store insert 失敗 (DB エラー) | `pending_signups.status='failed'` + `last_error` 保存 + Sentry。`?resume=1` で再試行 (verifyOtp skip、session 既存 + pending 読んで RPC 再実行) |
| 6 | 同 email で 2 店舗作りたい | ログイン中 user の `/onboarding` → 多店舗フロー (PR-2 で対応) |
| 7 | invite された人がリンク踏まずに自分で `/onboarding` した | email 重複で `signUp` 失敗 → 「既に登録済」表示 → ログインに誘導 → ログイン後に invite メール再クリック |
| 8 | スタッフ招待後にオーナーがキャンセル | `pending_invitations.status='revoked'`、招待メール届いていてもリンク踏むと revoked エラー |
| 9 | 招待 token 漏洩 | 32-byte 乱数 + 7 日失効 + 1 度使うと `accepted` 状態 = 再利用不可 |
| 10 | bounce で reachable でない email | PR-5 で記録、admin UI で警告 (UI は別 backlog) |
| 11 | `pending_signups` の停滞 row | `expires_at` 過ぎたら status='failed' に変更する cron (本 PR 範囲外、別 backlog) |

## 拡張性チェック (将来要件への耐性)

| 将来要件 | v4 での対応可否 |
|---|---|
| 1 user が複数店舗を経営 | ✅ PR-2 で対応済 |
| 店舗 owner 譲渡 | ✅ `store_member_events` + `store_members.role` 変更で対応 |
| Staff の細粒度 role (manager / part-time 等) | ✅ `store_members.role` CHECK を拡張 (migration 1 本) |
| 顧客 user signup (現状 anonymous のみ) | ✅ `/auth/confirm` の type 分岐に追加するだけ。`pending_signups` は流用不要 (顧客は store 持たない) |
| 招待 token 失効リセット | ✅ `pending_invitations.expires_at` 編集 + revoke |
| Email 配信失敗の検知 | ✅ PR-5 で対応 |
| 監査ログ | ✅ PR-6 で対応、将来 orders 等にも展開可 |
| i18n | templates を `_ja` `_en` 分割で対応 (将来) |
| SOC2 / GDPR 監査 | audit log + pending tables の retention policy 追加 (将来) |

## セキュリティ要点

- `pending_signups` `pending_invitations` `store_member_events` の RLS は **service role only**、anon/authenticated に GRANT しない
- `user_metadata` を完全に信用しない (callback で常に format + 重複再 validate)
- token (招待) は crypto.randomBytes(32) hex (256 bit) + 7 日失効 + 1 度使うと revoke
- `/auth/confirm` `/auth/invite-accept` は `Cache-Control: no-store`、token を Sentry に流さない
- rate limit を auth 系 endpoint 全部に (PR-3)
- bounce 検知で配信不能 user を可視化 (PR-5)
- store_members 変更を audit (PR-6)

## 工数

| PR | 工数 | 依存 |
|---|---|---|
| PR-1: SMTP + 5 templates | 私 2h + user 1h | なし、最初 |
| PR-2: onboarding redesign + 多店舗 + slug reservation + RPC | 6-8h | PR-1 merge |
| PR-3: auth endpoint rate limit | 2h | PR-1 (template) |
| PR-4: staff invite redesign | 4-5h | PR-2 (`/auth/confirm` 共通化) |
| PR-5: Resend webhook | 2-3h | PR-1 |
| PR-6: audit log | 2-3h | PR-2 / PR-4 |
| PR-7: tests + docs + backlog | 3-4h | 全 PR と並行 |

合計: ~25h (3-4 営業日)。pilot R2 は **全 PR merge 後** に再開。

## 関連

- `docs/customer-auth-design.md` — 既存の顧客 anon auth 設計 (本 redesign 後に統合書き換え)
- `docs/payment-flow.md` — payment と直接の依存はないが、`stores.stripe_account_id` 必須制約 (#50) と整合
- `AGENTS.md` §RLS の罠 — `pending_*` table の RLS 設定で必ず参照
- backlog #61〜#67 (本 redesign の各 PR エントリ)
