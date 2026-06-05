# Pilot 実機 audit チェックリスト (#51)

> R5: pilot 開始前の実機動作確認。R6 live smoke 直前に通過必須。
>
> 想定環境: test4 store (`mocal.jp/test4`) + 実機 iPhone (Safari) + 実機 Android (Chrome) + デスクトップブラウザ。Stripe Connect 接続済 / メニュー 5 件登録済 / `is_open=false` のまま開始。

## 前提準備

- [ ] test4 store にメニュー登録済 (5 件、`is_open=false` で受付停止中スタート)
- [ ] iPhone Safari + Android Chrome 用意 (両方ない場合は片方で OK、もう片方は backlog 化)
- [ ] PC ブラウザ 2 つ (顧客用シークレットウィンドウ + 店舗 admin)
- [ ] Stripe test mode (audit 用) と live mode (R6 用) を分離 — **audit は test mode 推奨**:
  - 環境変数を一時的に test key に切替? それとも live のまま安価に smoke?
  - ⚠️ 本 audit ドキュメント中で「test mode」とあるのは Stripe sandbox の話、mocal は production deploy のまま
  - **方針確認必要** (user 判断、§F 参照)

---

## A. Push 通知

### A1. 管理画面 Push (店舗側、`notifyStore()`)

**前提**: PC で `/admin/login` ログイン (test4 owner = me.com アカウント) 状態。

| # | 手順 | 期待 | 結果 |
|---|---|---|---|
| A1-1 | iPhone Safari で `https://mocal.jp/admin/login` 開く | ログイン画面 | [ ] |
| A1-2 | me.com で login | dashboard 着地 | [ ] |
| A1-3 | 「注文通知を受け取る」をタップ | Push 通知許可ダイアログ | [ ] |
| A1-4 | 「許可」 | DB の `push_subscriptions` テーブルに row 追加 (SQL で確認) | [ ] |
| A1-5 | PC シークレットで `/test4` 開く → メニュー注文 → 決済 (test mode) | iPhone に Push 通知到達 | [ ] |
| A1-6 | 通知の内容 (店舗名 / 注文番号 / 価格) が正確か | 正確 | [ ] |
| A1-7 | Android Chrome で同じく許可 → 新規注文 | Android 通知到達 | [ ] |

### A2. 顧客側 Push (`notifyOrder()`)

**前提**: A1 で新規注文済の order ID を確認、顧客側 device で `/orders/[order_id]` page 開いた状態。

| # | 手順 | 期待 | 結果 |
|---|---|---|---|
| A2-1 | 顧客 device (iPhone) で /orders/[id] 開く | 注文状況画面 | [ ] |
| A2-2 | Push 通知許可ダイアログ → 許可 | `order_push_subscriptions` に row 追加 | [ ] |
| A2-3 | 店舗 admin で status を `accepted` に変更 | iPhone に「受付完了」通知 | [ ] |
| A2-4 | `preparing` に変更 | (通知の仕様確認、現状は通知有無不明) | [ ] |
| A2-5 | `ready` に変更 | 「準備完了」通知 | [ ] |
| A2-6 | `cancelled` に変更 | 「キャンセル」通知 | [ ] |

⚠️ **iOS Safari の Push 通知制約**:
- iOS 16.4+ 必須 (PWA add to home screen 経由が安定)
- iOS Safari Private モードでは Push 通知不可
- Service Worker 動作確認が必要

### A3. Push 通知が届かない場合の切り分け

- [ ] Sentry に `web-push send error` が記録されていないか
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env が production に設定済
- [ ] Service Worker 登録: DevTools → Application → Service Workers で `active` 状態
- [ ] subscription endpoint が有効: DB の `push_subscriptions.endpoint` を curl で webpush 送信テスト (手動)

---

## B. Realtime 接続

| # | 手順 | 期待 | 結果 |
|---|---|---|---|
| B1 | 顧客 device で `/orders/[id]` (paid 状態) 開く | 注文状況画面 + ステータス「お支払い完了」 | [ ] |
| B2 | DevTools → Network → WS タブで websocket 接続確認 | `wss://...supabase.co/realtime/v1/websocket` 接続中 | [ ] |
| B3 | 店舗 admin で `accepted` に変更 | 顧客 page が **page refresh なし** で「受付完了」に切替 | [ ] |
| B4 | 順次 `preparing` → `ready` → `completed` に変更 | 各 step で auto-refresh | [ ] |
| B5 | Realtime 切断時 (Wi-Fi off → on) の挙動 | reconnect する / Polling fallback で表示更新 | [ ] |

⚠️ **fallback**: Realtime 接続が失敗した場合、`NEXT_PUBLIC_ORDER_POLLING_MS` (default 10s) の polling で代替。両方確認推奨。

---

## C. 機能復元 L1〜L10 (recovery-plan §2)

| L | 機能 | 検証手順 | 結果 |
|---|---|---|---|
| **L1** | コンボ商品表示 (cart + menu) | menu page でコンボ表示 → cart に追加 → 価格反映 → 注文完了 | [ ] |
| **L2** | 「スタンダード / 日時指定」ラベル | cart で pickup type 選択肢の表記が「スタンダード / 日時指定」(旧版「すぐ受取 / 時間指定」ではない) | [ ] |
| **L3** | 顧客キャンセル機能 | paid 状態の注文を顧客 page でキャンセル → refund → status=refunded | [ ] |
| **L4** | 内税表示 | cart の支払欄に「うち消費税」明示 | [ ] |
| **L5** | アップセル提案 | cart に「ご一緒にいかが？」表示 (test4 メニュー 1 件のみだと出ない可能性) | [ ] |
| **L6** | 2-step UI (カート → 注文確認) | 注文確定前に確認 step あり | [ ] |
| ~~L7~~ | ~~コンボのレシート行グループ化~~ | 復元済 (#54 audit で確認) | N/A |
| **L8** | FAQ ページ | `https://mocal.jp/faq` で 404 ではなく page 表示 | [ ] |
| **L9** | お問い合わせフォーム | `/for-stores` → お問い合わせ送信 → admin の inquiries 一覧に反映 | [ ] |
| **L10** | 店舗キャンセル時の理由選択 UI | admin で paid 注文 → キャンセル → 理由 (在庫切れ / 店舗都合) 選択 → DB に反映 | [ ] |

---

## D. 失敗 / 返金フロー (`docs/payment-flow.md` 図 B 8 経路)

各経路は **Stripe test mode** で safely 試せる。test card 4242 4242 4242 4242 + arbitrary CVC/expiry。

| 経路 | 内容 | 検証手順 | 期待 status | 結果 |
|---|---|---|---|---|
| [1] | 顧客 cancel | paid 状態の注文を /orders/[id] で「キャンセル」 | refunded | [ ] |
| [2] | 店舗 cancel | admin で paid 注文 → 「キャンセル」 → 理由選択 | refunded | [ ] |
| [3] | 外部返金 sync | Stripe Dashboard で手動 refund → webhook で mocal 同期 | refunded (notify 1 回のみ、#57 で fix 済) | [ ] |
| [4] | payment_failed | Stripe test card `4000 0000 0000 9995` (insufficient_funds) で決済 | cancelled (cancelled_reason_type='payment_failed') | [ ] |
| [5] | webhook 内 自動 cancel + refund | 店舗 `is_open=false` 中に注文成立 → webhook で自動 cancel + refund | cancelled or refunded (cancelled_reason_type='store_closed') | [ ] |
| [6] | PI 作成失敗 | (手動再現難、code coverage で代替) | cancelled | N/A (code coverage で確認済 #54) |
| [6'] | order_items insert 失敗 | (手動再現難、code coverage で代替) | cancelled | N/A |
| [7] | no_show | accept 後 ready にして `ready_at - 15 min` 経過待ち or DB 手動操作 | no_show | [ ] |
| [8] | pending timeout | pending のまま 30 分放置 (cron で検知) | cancelled (cancelled_reason_type='timeout') | [ ] |

⚠️ test mode の Stripe テストカード一覧: https://stripe.com/docs/testing#cards

---

## E. 既存店舗 (3000DAYS BURGER) 回帰

PR-3 (#61) 等の auth 変更が既存店舗に影響していないか確認。

| # | 手順 | 期待 | 結果 |
|---|---|---|---|
| E1 | 別シークレットで `/admin/login` を `d.tsukoshi@gmail.com` で login | dashboard 着地 (壊れていない) | [ ] |
| E2 | 3000DAYS BURGER の admin/settings 表示 | 既存通り、test4 のデータが見えない (多店舗分離 OK) | [ ] |
| E3 | 3000DAYS の `is_open=false` + `manual_override_until=...` を確認 | 構造的閉塞済 (handoff の §警告) | [ ] |

---

## F. 既知の制約 / Open issues

| 項目 | 状態 | pilot 開始判断への影響 |
|---|---|---|
| test4 Stripe セキュリティ申告書 draft | Stripe Japan サポート確認待ち、提出要否不明 | live 決済可否次第。通知警告なし = 当面 OK の signal |
| mocal 二段階認証 (MFA) | 未実装 | 申告書の「すべてはい」要件と乖離 → 申告書 submit 時にギャップ |
| CAPTCHA (#33) | 未実装 | 同上 |
| 形式 pentest | 未実施 | 同上 |
| `_dmarc.mocal.jp` policy | 未設定 (#68) | spoofing 可能、ただし pilot 即影響なし |
| Sentry source map upload (`SENTRY_AUTH_TOKEN`) | R4 で対応中 | 影響は debug 体験のみ、pilot 機能には影響なし |
| Help page (#70) | 未実装 | 将来店舗向け、pilot は user 1 名なので OK |
| `?resume=1` auto-detect (#69) | 未実装 | UX 改善のみ、pilot で問題が出るなら別途 |

---

## G. Audit 完了判定 + Sign-off

- [ ] A1〜A3 通過 (Push 通知 iOS/Android)
- [ ] B1〜B5 通過 (Realtime + polling)
- [ ] C L1-L10 通過 (L7 のみ除外、復元済)
- [ ] D [1]〜[8] 通過 ([6][6'] は code coverage 経由)
- [ ] E 既存店舗回帰なし
- [ ] F open issues は pilot 開始判断に取り込み済

**全 pass → R6 live smoke へ。**

---

## 失敗時の対応

各 [ ] が pass しない場合:
1. **Sentry 確認** — 該当 timeframe の event を捕捉
2. **ブラウザ DevTools** — Network / Console エラー
3. **DB state 確認** — Supabase SQL Editor で orders / push_subscriptions 等
4. fix が必要なら新規 PR → audit 再実行

「軽微な UX 問題」と「pilot blocker」を区別:
- 例: アップセル UI が出ないが機能としては動く → pilot 開始可能、L5 関連は別 PR
- 例: 決済成功するが status が更新されない → blocker、即修正

---

## 関連ドキュメント

- `docs/recovery-plan.md` §2 (L1-L10 詳細)
- `docs/payment-flow.md` 図 B (失敗 / 返金 8 経路)
- `docs/customer-auth-design.md` (顧客 anon auth)
- `docs/backlog.md` #51 (本 audit のエントリ)
- `docs/deploy-runbook.md` §smoke (pre-deploy active 注文確認)
