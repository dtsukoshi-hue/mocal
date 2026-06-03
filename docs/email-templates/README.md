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
| `{{ .ConfirmationURL }}` | 完全な確認 URL (token 含む) | confirm-signup / invite / reset-password / change-email |
| `{{ .Token }}` | 6 桁数字 OTP | reauthentication |
| `{{ .TokenHash }}` | hash 形式の token | (URL を自分で組み立てたい時用、本テンプレでは未使用) |
| `{{ .Email }}` | 受信者の email (現在のアドレス) | invite / change-email |
| `{{ .NewEmail }}` | change-email 時の新アドレス | change-email |
| `{{ .SiteURL }}` | Supabase URL Configuration の Site URL (= `https://mocal.jp`) | 全テンプレ (footer link) |
| `{{ .Data.<key> }}` | user_metadata の値 (Supabase が SDK 経由で受け取った `options.data`) | 必要に応じて |

⚠️ Liquid 変数は HTML エスケープ **されない** ことに留意 (受信者 email 等を本文に出すのは Supabase 側が制御するため通常問題ないが、`.Data.*` を出す場合は信頼境界に注意)。

## Dashboard へ paste する手順

1. Supabase Dashboard → Project (`mocal`) → **Authentication** → **Email Templates**
2. 各テンプレ (Confirm signup / Invite / Magic Link / Change Email Address / Reset Password / Reauthentication) を順に開く
3. **Subject heading**: 本 README の Subject 列の値を入力
4. **Message body**: 対応する `.html` ファイルの内容 (HTML コメント `<!-- ... -->` を含めて) を全文コピーして paste
5. Save
6. (Magic Link は mocal で未使用、template は default のままで OK)

## 検証手順 (PR-1 完了の受け入れ基準)

- [ ] Supabase Dashboard で 5 テンプレ全てが上記 HTML と一致 (subject + body 両方)
- [ ] Dashboard → Authentication → SMTP Settings が以下である:
  - Enable Custom SMTP: ON
  - Host: `smtp.resend.com`
  - Port: `587`
  - Username: `resend`
  - Password: `RESEND_API_KEY` の値
  - Sender email: `support@mocal.jp`
  - Sender name: `mocal`
- [ ] Dashboard → Authentication → URL Configuration:
  - Site URL: `https://mocal.jp`
  - Redirect URLs に以下が含まれる:
    - `https://mocal.jp/auth/confirm`
    - `https://mocal.jp/auth/invite-accept`
    - `https://mocal.jp/admin/reset-password`
    - `http://localhost:3000/**` (dev)
- [ ] **実 email テスト** (受け入れの中核): 自分宛 (user 個人 email) に signup → Resend ドメイン (`support@mocal.jp`) から `confirm-signup` テンプレートで届く / SPF / DKIM 両方 pass / spam folder に入っていない
- [ ] DMARC policy 確認: `dig TXT _dmarc.mocal.jp +short` で `p=` の値を確認。`p=none` なら別 backlog (#68 として `quarantine` 化) で対応

## 将来拡張

- i18n: `_ja.html` / `_en.html` 等で言語別に分割 (将来要件発生時)
- A/B test: 同 template の variant をフラグで切替 (Supabase Dashboard は variant 未対応、自前送信 (`lib/email.ts`) でのみ可能)
- preview rendering: HTML を render してスクリーンショットを CI で生成 → PR レビューで視覚的確認 (本 PR では未実装)
