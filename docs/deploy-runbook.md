# Deploy Runbook

> mocal の本番 deploy 手順と運用上の判断基準。  
> AGENTS.md「作業開始時にやること」「DB スキーマ」「Push 前のチェック」を補完する。  
> **危険操作 (migration apply / 重大 RLS 変更) の前にここを必ず読むこと。**

---

## 1. Deploy の種類別チェックリスト

### A. コードのみの変更（schema / RLS 変更なし）

| 順 | 作業 |
|---|---|
| 1 | ローカルで `npx tsc --noEmit` クリーン確認 |
| 2 | `npm test` で 全 vitest pass 確認 |
| 3 | `npm run lint` で 0 errors 確認 |
| 4 | `git push origin main` → Vercel 自動 deploy |
| 5 | Vercel deploy 完了確認（≈30〜60s）|
| 6 | 主要 URL の smoke (下記 §3)|
| 7 | CI が success になることを確認（GitHub Actions）|

### B. DB schema / RLS 変更を伴う deploy

**重要**: 既存運用への影響を最小化するため、必ず以下を踏む。

| 順 | 作業 | 注意 |
|---|---|---|
| 0 | **本番 active 注文を確認** (下記 §2)| 多い場合は完了を待つ |
| 1 | **低トラフィック時間帯選定** | JST 3〜5 AM 推奨 |
| 2 | A1-3 と同じ静的検査 | tsc / vitest / lint |
| 3 | Migration ファイルの内容レビュー | DROP / GRANT / REVOKE を読み返す |
| 4 | ロールバック migration 用 SQL を**手元に準備** | §5 参照 |
| 5 | `git push origin main` | Vercel deploy 開始 |
| 6 | Vercel deploy 完了確認 | code が先に live になる |
| 7 | `npx supabase db push --linked` | migration を本番に適用 |
| 8 | **Smoke + security regression test** (下記 §3+§4)| 30 秒以内に異常を検知 |
| 9 | 本番監視で異常がないか目視（10〜30 分）| §6 参照 |

> **deploy 順序の根拠**: code 先 → migration 後 にすることで、code は古い RLS でも動作する（fail-soft）。逆順だと migration 適用済みの状態で旧 code が動作し、認可周りでエラーが多発する。

---

## 2. Pre-deploy: 本番 active 注文の確認

DB 変更を伴う deploy では、影響を受ける可能性のある active 注文がいる場合は完了を待つ。

```bash
# Supabase Dashboard SQL Editor or psql で:
SELECT id, order_number, status, store_id, created_at
FROM public.orders
WHERE status IN ('paid', 'accepted', 'preparing', 'ready')
ORDER BY created_at DESC;
```

判断:
- **0 件**: 進めて OK
- **数件 (1〜3)**: 完了を待つ or 顧客への影響範囲を見極めて進める
- **多数 (5+)**: 完了を待つか、deploy 戦略を見直す

---

## 3. Smoke test (post-deploy)

deploy 完了後 1〜2 分以内に実施。

### 公開エンドポイント

```bash
for url in / /admin/login /for-stores /privacy /tokushoho /onboarding /api/health; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://mocal-iota.vercel.app$url")
  echo "$CODE  $url"
done
```

**期待**: 全て `200`

### 認証エンドポイント（cron）

```bash
# 認証なし → 401 を期待 (F-03 修正後)
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://mocal-iota.vercel.app/api/cron/store-hours
# → HTTP 401

# 認証あり → 200 を期待
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://mocal-iota.vercel.app/api/cron/store-hours
# → HTTP 200
```

### 顧客フロー (実 Stripe 決済)

実環境で実際の注文を 1 件作成して動作確認:

1. テスト店舗（または pilot 店舗）の URL を開く
2. メニューを 1 つカートに追加
3. お支払い → Stripe テストカード `4242 4242 4242 4242` で決済
4. `/orders/{id}` に遷移、注文番号が表示される
5. **別タブで** `/admin/dashboard` を開く
6. 該当注文を「受理」する
7. 顧客側で Realtime または 10s ポーリングで「受理済」が反映されるか確認

---

## 4. Security regression check (post-deploy)

F-18 同類の漏洩が deploy で復活していないか確認:

```bash
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY' .env.local | sed 's/.*=//; s/"//g')
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL' .env.local | sed 's/.*=//; s/"//g')

# 顧客データへの anon access が拒否されることを確認
curl -s -o /dev/null -w "anon orders: HTTP %{http_code}\n" \
  "$URL/rest/v1/orders?select=id&limit=1" -H "apikey: $ANON"
# → HTTP 401

curl -s -o /dev/null -w "anon order_items: HTTP %{http_code}\n" \
  "$URL/rest/v1/order_items?select=id&limit=1" -H "apikey: $ANON"
# → HTTP 401

# 公開データは引き続き読める
curl -s -o /dev/null -w "anon stores: HTTP %{http_code}\n" \
  "$URL/rest/v1/stores?select=id&limit=1" -H "apikey: $ANON"
# → HTTP 200
```

または直接 `npm run test:security` を実行（テスト 11 件全 PASS が期待値）。

---

## 5. Rollback 手順

### A. コードのみ rollback

```bash
git revert <commit-sha>
git push origin main
# Vercel が自動的に旧 code に戻す
```

### B. Migration の rollback

各 migration には対の「逆 migration」を**準備して残しておく**。例:

```sql
-- supabase/migrations/<ts>_rollback_<feature>.sql
-- 例: F-18 を意図的に再露出させる緊急 rollback (絶対に本番投入しないこと)
CREATE POLICY "orders_public_select_by_uuid_TEMP" ON public.orders
  FOR SELECT USING (true);
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.order_items TO anon;
```

適用:
```bash
npx supabase db push --linked
```

### C. Rollback トリガー条件（自動的に戻すべきケース）

以下のいずれかが発生したら**即座に rollback**:

- 主要 URL (`/`, `/admin/login`, 任意の店舗 slug) が **500** を返す
- `npm run test:security` が PASS → FAIL に変わる（RLS regression）
- 顧客から「注文できない / ステータス画面が真っ白」報告
- Vercel deploy で build error が出る（自動的に旧 deploy が active のまま）
- Supabase で大量のエラーログが出る（migration による副作用）

判断不能なケース（影響範囲が読めない）も rollback 寄りで対応。

---

## 6. Post-deploy 監視

deploy 後 30 分は以下を chase する:

- Vercel ダッシュボード: deployment ログ / runtime ログ
- Supabase ダッシュボード: API logs / Auth logs / DB logs
- 本番 URL の応答時間（手動で curl）
- 顧客からの問い合わせ（メール / sentry 等の reporting 経路）

将来 Sentry 導入 (#15) 後はアラート設定で自動化する。

---

## 7. よくある落とし穴

### Vercel env 変更の反映

`vercel env add ...` で env 追加・変更しても、**Redeploy しないと反映されない**。  
Production 環境変数の変更後は必ず Deployments → 最新 → Redeploy。

### Sensitive env の取り扱い

Sensitive flag が付いた env は `vercel env pull` で空文字が返る。  
ローカル開発時に Sensitive env が必要なら Dashboard から手動コピー (`AGENTS.md`「ローカル `.env.local` の復旧手順」参照)。

### `supabase db push` の前に link 確認

```bash
cat supabase/.temp/linked-project.json
# → "project_id" が production であることを確認
```

別環境（staging 等）に向いていると、本番 DB に反映されない事故が起きる。

### Migration の不可逆性

DROP TABLE / DROP COLUMN を含む migration は **データを失う**。  
事前に DB バックアップを取り、復元手順を確認してから適用する。

---

## 8. Deploy 記録

過去の重大 deploy の記録（学習用）:

| 日付 | commit | 内容 | 教訓 |
|---|---|---|---|
| 2026-05-21 | `eac58f0` | CRON_SECRET 登録 + F-03 解消 | env 変更は Redeploy 必須 |
| 2026-05-21 | `5a92591` | F-01: Supabase migrations を repo 取り込み | types 整合性は db:check で都度確認 |
| 2026-05-21 | `79c5cb2` | F-18: anon SELECT 漏洩を migration で閉じる | code 先 → migration 後の順守。security test が客観指標 |
| 2026-05-22 | `ab2c119` | #36: Server Action レート制限 | proxy.ts の変更は proxy.test.ts で恒久 verify |
| 2026-05-22 | `cf2d35f` | #34: anonymous user cleanup cron + FK SET NULL | code 先 → migration 後の順を踏襲。新 cron 系統は env flag で default off で本番安全 |

---

## 9. 初回セットアップ (one-time)

本番環境を一から立ち上げる、または新しい外部サービスを繋ぐ際の手順。**一度だけ実行**して `[x]` 化する性質のものをまとめる。

### 9.1 外部 cron スケジューラ設定 (backlog #2 / Hobby plan 暫定)

**前提**: Vercel **Hobby plan** は cron が「1日2回・daily 限定」なので、`/api/cron/no-show` (1分) と `/api/cron/store-hours` (5分) は **Vercel Cron では実行不可**。Pro plan ($20/月) 移行までは外部スケジューラで叩く。実証実験開始時に Pro 化して `vercel.json` の `crons` に移行する。

**採択スケジューラ**: [cron-job.org](https://cron-job.org) (無料・上限なし・Bearer ヘッダー設定可能)

#### 設定する 3 ジョブ

| Job 名 | URL | 間隔 | 備考 |
|---|---|---|---|
| `mocal-store-hours` | `https://mocal-iota.vercel.app/api/cron/store-hours` | 5 分 | 営業時間に応じて店舗の `is_open` を自動切替 |
| `mocal-no-show` | `https://mocal-iota.vercel.app/api/cron/no-show` | 1 分 | 受取期限を過ぎた注文を `no_show` 化 |
| `mocal-cleanup-anon` | `https://mocal-iota.vercel.app/api/cron/cleanup-anonymous-users` | daily 03:00 JST | `CLEANUP_ANON_USERS_ENABLED=1` 設定後に有効。それまでは dry-run のみ |

#### 手順

1. cron-job.org にサインアップ → ダッシュボード
2. CRON_SECRET の実値を取得（cron-job.org のヘッダー欄に貼る用）:
   ```bash
   grep '^CRON_SECRET=' .env.local
   ```
   出力された `CRON_SECRET="xxxxx..."` の `xxxxx` 部分（クォート内）をコピー。
3. **Create cronjob** → 各ジョブを以下で設定:
   - **Title**: 上記 Job 名
   - **URL**: 上記 URL
   - **Execution schedule**:
     - 5 分 / 1 分: "Common" タブで該当を選択
     - 03:00 daily: "Custom" タブで Minutes=`0` / Hours=`3` / Days・Months・DOW=`*` (cron 式 `0 3 * * *`)
   - **Timezone**: Asia/Tokyo
   - **Advanced → Request method**: GET
   - **Advanced → Request headers**:
     - Header: `Authorization`
     - Value: `Bearer <2 でコピーした値>` ⚠️ `Bearer` の後の**半角スペース**を忘れると 401 になる頻発ミス
   - **Notifications**: 失敗時メール通知 ON 推奨
4. 各 Job を save → **Test run** ボタンで初回手動実行
5. レスポンスが `HTTP 200` + JSON `{ok: true, ...}` であることを確認
   - 401 → Authorization header の値が誤り（`Bearer ` の半角スペース漏れが頻発）
   - 500 → Vercel 側のエラー、Vercel ログ確認

#### 動作確認

```bash
# 認証なし → 401
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://mocal-iota.vercel.app/api/cron/store-hours
# → HTTP 401

# 認証あり → 200
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://mocal-iota.vercel.app/api/cron/store-hours
# → HTTP 200
```

cron-job.org の **History** タブで定期的に 200 が並んでいることを翌日確認。

#### Pro 移行時の手順 (将来)

1. `vercel.json` の `crons` に 3 ジョブ追加（path + schedule）
2. Vercel Cron は自動的に Bearer ヘッダーを付与（`x-vercel-cron-signature` 検証に切替も可）
3. cron-job.org の 3 Job を pause → 動作確認 → delete

### 9.2 Stripe Connect 設定 (backlog #4)

新規店舗 onboarding で `/api/onboarding/stripe/connect` から Stripe OAuth が開始される。`STRIPE_CLIENT_ID` 未設定だと 500 を返す ([app/api/onboarding/stripe/connect/route.ts:14-17](../app/api/onboarding/stripe/connect/route.ts))。

#### 手順

1. **Stripe Dashboard を開く**: https://dashboard.stripe.com/settings/connect
   - ⚠️ 画面右上「**Viewing test data**」トグルを確認。本番運用するモードで作業する（test mode と live mode で **Client ID は別物**、混在させない）
2. **Integration** セクションの **Enable OAuth for Standard accounts** を ON
3. **Client ID** (`ca_xxxxx`) をコピー — これが `STRIPE_CLIENT_ID`
4. 同ページの **Redirect URIs** に追加（Add URI → Save）:
   - `https://mocal-iota.vercel.app/api/onboarding/stripe/callback`
   - （開発時のみ）`http://localhost:3000/api/onboarding/stripe/callback`
5. **Vercel env 登録** (Production / Preview / Development 全環境):
   - https://vercel.com/dtsukoshi-hues-projects/mocal/settings/environment-variables
   - Key: `STRIPE_CLIENT_ID`、Value: 上記 `ca_xxxxx`、**Sensitive: ON**
6. **Redeploy** (env 変更は再デプロイ必須):
   ```bash
   # 事前確認
   npx vercel whoami                          # 認証されているか (username が出れば OK)
   ls .vercel/repo.json .vercel/project.json  # プロジェクトリンク済か (いずれか存在で OK)
   # 未認証なら `npx vercel login <email>` (GitHub に問題があるとき email 経路を使う)
   # 未リンクなら `npx vercel link`
   npx vercel --prod
   ```
   ⚠️ Vercel Dashboard の **"Redeploy" ボタンは使わない**。Vercel の Git 連携設定によっては GitHub から source を fetch するため、GitHub アカウント側に問題があるとき (suspend 等) に失敗する。CLI 経路は local files を直接 upload するので独立に動く。
7. **`.env.local` を更新**:
   - 新規 key として追加するだけなら `echo 'STRIPE_CLIENT_ID="ca_xxxxx"' >> .env.local` で完結
   - 既存値を差し替える場合は Sensitive のため `vercel env pull` では空文字。Dashboard から「Show value」で手動コピーして貼り付け
8. **疎通確認**:
   - 本番に店舗ログイン状態でアクセス → `/admin/settings` の Stripe 連携ボタン
   - Stripe OAuth ページにリダイレクトされれば成功（実際に connect するかは任意）

#### 動作確認 (未ログイン状態でも 500 でないことだけ確認)

ログインしていない状態だと 401 や redirect になるので、500 (`STRIPE_CLIENT_ID が設定されていません。`) が出ないことのみ確認:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  https://mocal-iota.vercel.app/api/onboarding/stripe/connect
# → HTTP 401 もしくは 3xx（500 でなければ OK）
```

---

## 関連ドキュメント

- `AGENTS.md` — 運用全般、過去事故記録
- `docs/workflow.md` — アーキテクチャ全体図
- `docs/customer-auth-design.md` — 顧客認証の設計
- `docs/security-review-2026-05-21.md` — F-01〜F-18 のセキュリティ findings
- `docs/rls-review-checklist.md` — RLS ポリシー設計の原則
- `supabase/migrations/README.md` — DB スキーマ管理
