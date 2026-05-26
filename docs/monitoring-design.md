# 監視・アラート設計ドキュメント (#15)

> **status**: 設計案 (実装未着手)  
> **作成日**: 2026-05-26  
> **目的**: pilot 実証実験〜本格運用に耐える監視・アラート基盤を構築。Sentry / Vercel Logs / 外部 cron 監視の組み合わせで、人間が tail しなくても異常を検知できる状態にする。  
> **関連**: backlog #15、`lib/logger.ts` (TODO コメント参照)、`docs/customer-auth-design.md` (anonymous sign-in spam 検知)、`docs/captcha-design.md` (#33)

---

## 1. 監視対象の優先度マップ

| 優先 | 対象 | 検知すべき症状 | 現状 |
|---|---|---|---|
| **P0** | Stripe Webhook 失敗 | retry が止まらない / 200 を返したが処理失敗 | Vercel ログのみ、人間が tail しないと気付かない |
| **P0** | cron 失敗 (3 ジョブ) | 受付状態が切り替わらない / no_show 自動化が止まる / anon cleanup 止まる | cron-job.org の失敗通知メールだけ |
| **P0** | サーバーエラー率 (5xx) | 注文 submit や決済直前で 500 が出る | console.error → Vercel ログのみ |
| **P1** | anonymous sign-in rate | スパイク = MAU 攻撃 (#33 で CAPTCHA 入る前段の指標) | 未計測 |
| **P1** | Supabase 使用率 | MAU / DB 容量 / Auth users 件数の境界接近 | 未計測 |
| **P2** | Realtime / WebSocket 切断 | 顧客側の注文状態更新が止まる | 未計測、UI 側 polling fallback あり |
| **P2** | レート制限の発火頻度 (#36) | 攻撃検知 / 誤発火検知 | logger に出ているが集計なし |
| **P3** | Web Vitals (LCP / INP / CLS) | UX 劣化 | 未計測 |

---

## 2. ツール構成

### 2.1 採択: **Sentry**

理由:
- **無料枠が pilot 規模に十分**: 5,000 errors/月、10,000 perf events/月（mocal は初期 100 注文/日程度想定なので十分）
- **Next.js 16 公式統合あり** (`@sentry/nextjs`): RSC / Server Action / Route Handler / Edge middleware 全てカバー
- **structured log → breadcrumb 自動取得**: `lib/logger.ts` を差し替えるだけで既存の `logger.error()` 呼び出しが Sentry に流れる
- **アラート設定 GUI**: 「5 分間に 5xx が 10 件超」「errorRate > 1%」等を SaaS 側で設定、Slack/Email 通知
- **Source map 対応**: minified スタックトレースを source 行にマップ

### 2.2 補完ツール

| ツール | 役割 | コスト |
|---|---|---|
| **Vercel Logs** (built-in) | 基礎的なリクエストログ、`logger.info()` 等の info ログ | 既に有効 |
| **cron-job.org notifications** | cron 個別失敗のメール通知 (P0) | 既に運用予定 (#2) |
| **Supabase Dashboard alerts** | DB 使用率・MAU の閾値通知 | free 版で日次サマリ |
| **UptimeRobot** (任意) | 本番 `/api/health` の 5 分間隔 ping、ダウンタイム検知 | free 50 monitors |

Sentry が中央集約、他は補完。重複アラートは Sentry 優先で抑止する設定にする。

---

## 3. 実装方針

### 3.1 Sentry の導入手順

#### a. Sentry アカウント・プロジェクト作成

1. https://sentry.io でサインアップ → Organization `mocal` 作成
2. **Create Project** → Platform: **Next.js**、Project name: `mocal-prod`
3. DSN (`https://<key>@<org>.ingest.sentry.io/<project>`) を取得

#### b. SDK インストール

```bash
npm install --save @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Wizard が以下を自動生成:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts` (App Router)
- `next.config.ts` に `withSentryConfig` ラップ
- `.sentryclirc` (source map upload 用、`.gitignore` 推奨)

#### c. 環境変数

```bash
# .env.local
NEXT_PUBLIC_SENTRY_DSN="<public DSN>"  # フロント用、公開 OK
SENTRY_DSN="<same>"                     # サーバー用
SENTRY_ORG="mocal"
SENTRY_PROJECT="mocal-prod"
SENTRY_AUTH_TOKEN="<source-map-upload-token>"  # CI/CD のみ、Sensitive
```

Vercel 側にも同じ 5 つを登録。`SENTRY_AUTH_TOKEN` は Sensitive。

#### d. `lib/logger.ts` を差し替え

現状の `emit()` は `console.log/error` のみ。これを **Sentry breadcrumb + level 別 capture** に切り替える:

```ts
// lib/logger.ts (改修後イメージ)
import * as Sentry from '@sentry/nextjs'

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const entry = { ts: new Date().toISOString(), level, msg: message, ...fields }

  // 1. structured log (今まで通り Vercel に流れる)
  if (level === 'error') console.error(JSON.stringify(entry))
  else console.log(JSON.stringify(entry))

  // 2. Sentry breadcrumb (常時)
  Sentry.addBreadcrumb({ level: level === 'debug' ? 'debug' : level, message, data: fields })

  // 3. error 以上は capture
  if (level === 'error') {
    const err = fields?.error instanceof Error ? fields.error : new Error(message)
    Sentry.captureException(err, { extra: fields })
  }
}
```

#### e. PII sanitize

mocal は **anonymous user UUID / email / 注文番号** を扱うので、Sentry に流れる前に sanitize 必須:

```ts
// sentry.server.config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,  // perf 10% sample
  beforeSend(event) {
    // request body / cookie に注文情報が乗りうるので drop
    if (event.request?.cookies) delete event.request.cookies
    if (event.request?.headers) {
      delete event.request.headers['cookie']
      delete event.request.headers['authorization']
    }
    return event
  },
})
```

### 3.2 アラート設定 (Sentry 側 GUI で設定)

| アラート | 条件 | 通知先 |
|---|---|---|
| 5xx 急増 | 1 分間に `level:error` 5 件以上 | Email + Slack |
| Stripe webhook 処理失敗 | `event.message contains "stripe webhook"` && error level | Email |
| anonymous sign-in spike | `breadcrumb.message contains "signInAnonymously"` 1 分 10 回以上 | Email |
| cron failure | `event.message contains "cron/" && level:error` | Email |
| First seen issue (new bug) | 新規 issue 発生 | Email |

### 3.3 cron 個別の死活監視

cron-job.org の builtin 通知 (失敗時メール) と Sentry の二重監視。さらに「**1 分 cron が 5 分連続失敗 = 1 ジョブ完全停止**」を検知するため、cron 自体で開始時 / 完了時に `logger.info('cron/no-show start')` 等を出し、Sentry の「期待される event が一定期間出ない」を **Sentry Cron Monitor** で監視する (Sentry 機能、free 枠あり):

```ts
// app/api/cron/no-show/route.ts
import * as Sentry from '@sentry/nextjs'

export async function GET(request: NextRequest) {
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: 'no-show', status: 'in_progress' },
    { schedule: { type: 'crontab', value: '* * * * *' } }
  )
  try {
    // 既存処理
    Sentry.captureCheckIn({ checkInId, monitorSlug: 'no-show', status: 'ok' })
  } catch (e) {
    Sentry.captureCheckIn({ checkInId, monitorSlug: 'no-show', status: 'error' })
    throw e
  }
}
```

これで「外部スケジューラが死んだ」「endpoint が timeout した」「処理は走ったが例外で落ちた」を全部一画面で見られる。

### 3.4 Web Vitals (P3、後回し可)

Next.js の `useReportWebVitals` で LCP/INP/CLS を Sentry に投げる。Sentry の **Performance** タブに表示。pilot 時の Web 体験劣化の早期発見に使う。

---

## 4. 検証戦略

### 4.1 自動テスト

| テスト | 内容 |
|---|---|
| `tests/lib/logger.test.ts` 新規 | `emit('error', ...)` で `Sentry.captureException` が呼ばれること (Sentry SDK mock) |
| 既存テスト | logger 差し替え後も全 280 ケース PASS |

### 4.2 手動 smoke

1. 本番に SDK 反映 → Sentry Dashboard を開く
2. 故意に `/api/health?_test=throw` 等で例外を投げる（テスト endpoint を一時用意 or 既存 endpoint で）
3. 1 分以内に Sentry に Issue が出ることを確認
4. アラート rule が発火、Email が届くこと

### 4.3 Source map

Sentry Dashboard で Issue を開き、スタックトレースが minified ではなく `app/api/orders/[id]/route.ts:136` のように source path 解決されていること。

---

## 5. 工数 / 実施順

| ステップ | 工数 | 備考 |
|---|---|---|
| Sentry account + project 作成 + DSN 取得 | 30 分 | ユーザー作業 |
| `@sentry/nextjs` wizard 実行 + 設定ファイル commit | 1 時間 | next.config.ts 変更を含む |
| `lib/logger.ts` 差し替え + 既存テスト維持 | 1 時間 | mock 戦略決定 |
| PII sanitize (`beforeSend`) | 30 分 | request cookie / auth header drop |
| Cron Monitor 統合 (3 ジョブ) | 1 時間 | captureCheckIn 各 endpoint に |
| アラート rule GUI 設定 | 30 分 | ユーザー作業 |
| 手動 smoke + source map 確認 | 30 分 | 本番反映後 |
| **合計** | **約 半日〜1 日** | backlog 見積もり (半日〜1日) と一致 |

---

## 6. 実施タイミング

> backlog #15: "Sentry 導入、Webhook 失敗監視、cron 失敗監視、anonymous sign-in rate 異常検知 (#25/#32 後)、DB 使用率監視 (#34 trigger 用)"

**前提条件**:
- [x] #32 anonymous sign-in 実装済
- [x] #34 anon cleanup cron 実装済
- [ ] #2 cron 外部スケジューラ実稼働化 (進行中)

#2 の cron が動き始めたタイミング (= Sentry Cron Monitor が「期待 schedule」を持てる) で着手するのが理にかなう。**pilot 開始の 1〜2 日前を目安**に。

---

## 7. 関連

- `lib/logger.ts` — 差し替え対象（TODO コメント済）
- `docs/customer-auth-design.md` — anonymous sign-in spike 検知の文脈
- `docs/captcha-design.md` (#33) — sign-in spike は CAPTCHA で抑止、監視は予兆検知
- `docs/deploy-runbook.md` §6 — 既存の「Post-deploy 監視」セクションと統合する
