# mocal Email Templates (Supabase Auth)

このディレクトリの HTML が **canonical** (真の source)。Supabase Dashboard 上のテンプレートはここからコピーされた apply 先。

## なぜ commit が canonical か

- Dashboard 上の手書き編集は diff レビュー不可、誰がいつ何を変えたか追えない
- 全環境 (本番 / 将来の staging) で同一テンプレートを保証したい
- 文言修正の history が `git log` に残る
- セキュリティレビュー対象 (XSS / フィッシング誘導文言等) として PR で承認したい

## 運用ルール

1. **修正は必ずこのディレクトリの `.html` を編集 → PR レビュー → merge**
2. merge 後、user が **Supabase Dashboard で paste** (canonical → Dashboard 方向の片道同期)
3. Dashboard で直接編集する場合は **必ず本ディレクトリに back-port する PR を出す** (両者の drift を 0 に維持)
4. テンプレート追加時は本 README の表に行を追加

## テンプレート一覧

| ファイル | Supabase テンプレ名 | Subject | 送信トリガ | 状態 |
|---|---|---|---|---|
| `confirm-signup.html` | Confirm signup | 【mocal】メールアドレスの確認 | `auth.signUp()` (Confirm email ON 時) | **有効** (#62 PR-2 で本格利用) |
| `invite.html` | Invite user | 【mocal】店舗への招待が届きました | `auth.admin.inviteUserByEmail()` | **fallback のみ** (本番招待は #64 PR-4 で自前 token + `lib/email.ts` 経由、Supabase invite は使わない方針) |
| `reset-password.html` | Reset Password | 【mocal】パスワード再設定のご案内 | `auth.resetPasswordForEmail()` | **有効** (既存 `/admin/reset-password` で利用) |
| `change-email.html` | Change Email Address | 【mocal】メールアドレス変更の確認 | `auth.updateUser({ email })` | **未使用** (将来 account settings UI で有効化、先行 branded 化) |
| `reauthentication.html` | Reauthentication | 【mocal】本人確認コード | `auth.reauthenticate()` | **未使用** (将来 sensitive operation で有効化、先行 branded 化) |

## Liquid 変数

Supabase Auth が template に注入する変数 ([公式](https://supabase.com/docs/guides/auth/auth-email-templates#template-variables)):

| 変数 | 内容 | 使用テンプレート |
|---|---|---|
| `{{ .ConfirmationURL }}` | 完全な確認 URL (Supabase verify endpoint 経由 = PKCE) | **本テンプレでは使用しない** (アプリ /auth/confirm の token_hash 経路と整合させるため、明示組み立て) |
| `{{ .Token }}` | 6 桁数字 OTP | reauthentication |
| `{{ .TokenHash }}` | hash 形式の token | **confirm-signup / invite / reset-password / change-email** (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...` 形式で組み立て) |
| `{{ .Email }}` | 受信者の email (現在のアドレス) | invite / change-email |
| `{{ .NewEmail }}` | change-email 時の新アドレス | change-email |
| `{{ .SiteURL }}` | Supabase URL Configuration の Site URL (= `https://mocal.jp`) | 全テンプレ (footer link) |
| `{{ .Data.<key> }}` | user_metadata の値 (Supabase が SDK 経由で受け取った `options.data`) | 必要に応じて |

⚠️ Liquid 変数は HTML エスケープ **されない** ことに留意 (受信者 email 等を本文に出すのは Supabase 側が制御するため通常問題ないが、`.Data.*` を出す場合は信頼境界に注意)。

## User 側 Dashboard 作業手順 (PR-1 受け入れチェックリスト)

所要 ~60 分。順番厳守 (③前に②、⑤前に①②③④全部)。

### ① Resend SMTP 用 API key 作成 (5 分)

1. https://resend.com/api-keys
2. **Create API Key**:
   - Name: `mocal-supabase-smtp`
   - Permission: **Sending access**
   - Domain: `mocal.jp`
3. 生成された `re_xxx` を控える
4. **既存 `RESEND_API_KEY` (`.env.local` / Vercel、`lib/email.ts` 用) は触らない** — 漏洩 / revoke 時の影響を分離するため別 key 運用

### ② Supabase Auth → SMTP Settings (10 分)

`Authentication` → **`SMTP Settings`** タブ:

| 項目 | 値 |
|---|---|
| Enable Custom SMTP | **ON** |
| Sender email | `support@mocal.jp` |
| Sender name | `mocal` |
| Host | `smtp.resend.com` |
| Port number | `587` |
| Minimum interval between emails | `60` (default、変更不要) |
| Username | `resend` |
| Password | ①で生成した `re_xxx` |

**Save**

### ③ Email Templates (5 種、20 分)

`Authentication` → **`Email Templates`** タブ。Magic Link は触らない (mocal で未使用)。

各テンプレ画面で **Subject heading** と **Message body** の両方を書き換え → **Save Changes**:

| Supabase テンプレ | Subject (paste) | Body (paste するファイル) |
|---|---|---|
| Confirm signup | `【mocal】メールアドレスの確認` | `confirm-signup.html` 全文 |
| Invite user | `【mocal】店舗への招待が届きました` | `invite.html` 全文 |
| Reset Password | `【mocal】パスワード再設定のご案内` | `reset-password.html` 全文 |
| Change Email Address | `【mocal】メールアドレス変更の確認` | `change-email.html` 全文 |
| Reauthentication | `【mocal】本人確認コード` | `reauthentication.html` 全文 |

HTML 先頭の `<!-- ... -->` コメントも含めて全文 paste で OK (コメントはレンダリングされない)。

### ④ URL Configuration (5 分)

`Authentication` → **`URL Configuration`**:

**Site URL**: `https://mocal.jp` (既に設定済の確認のみ)

**Redirect URLs** allowlist に以下を**追加** (重複しているものはスキップ):
```
https://mocal.jp/auth/confirm
https://mocal.jp/auth/invite-accept
https://mocal.jp/admin/reset-password
http://localhost:3000/**
```

**Save**

### ⑤ 実 email テスト (15 分、最重要)

1. プライベートウィンドウで `https://mocal.jp/onboarding` を開く
2. 任意の自分のメール (test用) で sign up を試行
   - 現行 onboarding は構造欠陥でエラーになるが、**メールが届けば PR-1 検証は success**
3. 受信メールの確認項目:
   - [ ] **送信元**: `mocal <support@mocal.jp>` (`mail.app.supabase.io` ではない)
   - [ ] **件名**: `【mocal】メールアドレスの確認`
   - [ ] **本文**: orange ヘッダ + ボタン + URL の mocal ブランド
   - [ ] **配信先**: 受信ボックス (spam フォルダではない)
   - [ ] **Gmail の場合**: メール詳細展開 → `mailed-by: mocal.jp` + `signed-by: mocal.jp` (両方 mocal.jp = SPF / DKIM 共に pass)
4. cleanup: Supabase → Authentication → Users で作成された test user を削除

### ⑥ DMARC policy 確認 (5 分)

```bash
dig TXT _dmarc.mocal.jp +short
```

- `"v=DMARC1; p=none; ..."` → `p=none` (許容、別 backlog #68 で `p=quarantine` 化を検討)
- `"v=DMARC1; p=quarantine; ..."` または `p=reject` → 良好
- 出力なし → DMARC 未設定 (要対応、別 backlog で追加)

## 受け入れ判定

✅ ⑤ で実メールが mocal ブランドで届く + SPF/DKIM pass + 非 spam  
✅ ⑥ で DMARC policy を確認 (`p=none` でも本 PR-1 は OK、結果を共有)

両方 OK で `PR-1 受け入れ完了` → PR-2 (#62 onboarding redesign 本体) merge へ進む。

## トラブルシュート

| 症状 | 原因候補 | 対処 |
|---|---|---|
| メールが届かない | SMTP 設定誤り (②) / Resend API key 権限不足 (①) | Supabase Auth Logs を Dashboard で確認、Resend Dashboard → Logs で送信記録確認 |
| `mail.app.supabase.io` から届く | ② Enable Custom SMTP が OFF | ② を ON にして Save、再テスト |
| spam フォルダに入る | SPF / DKIM 失敗、または DMARC `p=quarantine` で誤検知 | ⑥ DMARC 確認、`dig TXT mocal.jp +short` で SPF (`v=spf1 include:resend.com ~all` 等)、`dig TXT resend._domainkey.mocal.jp` で DKIM record 存在確認 |
| Subject や Body が反映されない | ③ Save 漏れ / 別タブで作業した | 各 template 画面で確実に **Save Changes** ボタンを押す |
| Confirmation link が localhost に飛ぶ | ④ Site URL が `localhost` のまま | ④ Site URL を `https://mocal.jp` に変更 + Save |

## 将来拡張

- i18n: `_ja.html` / `_en.html` 等で言語別に分割 (将来要件発生時)
- A/B test: 同 template の variant をフラグで切替 (Supabase Dashboard は variant 未対応、自前送信 (`lib/email.ts`) でのみ可能)
- preview rendering: HTML を render してスクリーンショットを CI で生成 → PR レビューで視覚的確認 (本 PR では未実装)
