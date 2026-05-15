import type { Metadata } from 'next'
import Link from 'next/link'

// nonce-based CSP（proxy.ts）が機能するよう動的レンダリングを強制
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '飲食店オーナー様へ — mocal',
  description:
    'mocal はポスレジ不要・即日導入できるテイクアウト事前注文プラットフォームです。' +
    '顧客手数料ゼロ、店舗手数料は売上の 10% のみ。QR コードを設置するだけで当日から注文受付を開始できます。',
  openGraph: {
    title: '飲食店オーナー様へ — mocal',
    description:
      'ポスレジ不要・即日導入。顧客手数料ゼロのテイクアウト事前注文プラットフォーム。',
    type: 'website',
    siteName: 'mocal',
  },
  twitter: {
    card: 'summary',
    title: '飲食店オーナー様へ — mocal',
    description:
      'ポスレジ不要・即日導入。顧客手数料ゼロのテイクアウト事前注文プラットフォーム。',
  },
}

const FEATURES = [
  {
    title: '即日導入',
    body: 'QR コードを店頭に設置するだけ。専用機器・タブレット不要。スマートフォン 1 台で注文管理できます。',
  },
  {
    title: '顧客手数料ゼロ',
    body: 'お客様への追加負担はありません。手数料は店舗様の売上から差し引く 10%（mocal 6.4% + Stripe 3.6%）のみ。',
  },
  {
    title: 'リアルタイム通知',
    body: '新規注文が入ると即座にプッシュ通知。ステータスを更新するとお客様にも自動通知されます。',
  },
  {
    title: '売上レポート',
    body: '日次・月次の売上グラフ、時間帯別注文数、メニューごとの分析を標準搭載。',
  },
  {
    title: '待ち時間を自動管理',
    body: '受付時に待ち時間を設定。準備完了になればお客様のスマホに通知が届くので、店頭での案内が不要になります。',
  },
  {
    title: 'セキュアな決済',
    body: 'Stripe Connect により、売上は翌月店舗様の口座に直接振り込まれます。PCI DSS 準拠で安全。',
  },
]

const STEPS = [
  {
    num: '01',
    label: 'お問い合わせ',
    body: 'メールにてご連絡ください。ご質問・デモのご要望も歓迎します。',
  },
  {
    num: '02',
    label: 'Stripe 口座接続',
    body: '既存の Stripe アカウントを接続、または新規作成（無料）。所要時間 5〜10 分。',
  },
  {
    num: '03',
    label: 'メニュー登録',
    body: '管理画面からメニューを登録。カテゴリ・価格・写真まで細かく設定できます。',
  },
  {
    num: '04',
    label: 'QR コード掲示',
    body: '設定ページで QR コードを取得し、店頭に掲示するだけで受付開始です。',
  },
]

export default function ForStoresPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-lg font-black text-gray-900">
            mo<span className="text-orange-500">cal</span>
          </Link>
          <Link
            href="mailto:support@mocal.jp"
            className="text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl transition-colors"
          >
            お問い合わせ
          </Link>
        </div>
      </header>

      <main id="main-content">
        {/* ヒーロー */}
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest">
              飲食店オーナー様へ
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
              ポスレジ不要。<br />
              <span className="text-orange-500">即日</span>からテイクアウト注文を受け付ける。
            </h1>
            <p className="text-base text-gray-600 max-w-xl mx-auto leading-relaxed">
              mocal はスマートフォンだけで注文管理ができるテイクアウト事前注文プラットフォームです。
              顧客手数料ゼロ、店舗手数料は売上の <strong>10%</strong> のみ。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="mailto:support@mocal.jp?subject=mocal 導入のお問い合わせ"
                className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                無料で相談する<span aria-hidden="true"> →</span>
              </Link>
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                今すぐ登録する
              </Link>
            </div>
          </div>
        </section>

        {/* 料金 */}
        <section className="max-w-3xl mx-auto px-4 py-12">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-8">シンプルな料金体系</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: '初期費用', value: '¥0', note: '無料' },
              { label: '月額固定費', value: '¥0', note: '無料' },
              { label: '決済手数料', value: '10%', note: '売上から差し引き（mocal 6.4% + Stripe 3.6%）' },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center"
              >
                <p className="text-xs font-semibold text-gray-500 mb-2">{item.label}</p>
                <p className="text-3xl font-black text-orange-500 mb-1">{item.value}</p>
                <p className="text-xs text-gray-400">{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 機能一覧 */}
        <section className="bg-white border-y border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-12">
            <h2 className="text-xl font-bold text-gray-900 text-center mb-8">主な機能</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-stone-50 rounded-2xl p-5 space-y-2">
                  <div className="w-1 h-5 bg-orange-400 rounded-full" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-gray-900">{f.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 導入ステップ */}
        <section className="max-w-3xl mx-auto px-4 py-12">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-8">導入までの流れ</h2>
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex gap-5 items-start"
              >
                <span className="text-2xl font-black text-orange-200 tabular-nums shrink-0">
                  {s.num}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">{s.label}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-orange-500">
          <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4">
            <h2 className="text-xl font-bold text-white">まずはお気軽にご相談ください</h2>
            <p className="text-sm text-orange-100">
              デモのご要望・ご質問はメールにてお受けしています。<br />
              お返事まで 1〜2 営業日いただく場合があります。
            </p>
            <Link
              href="mailto:support@mocal.jp?subject=mocal 導入のお問い合わせ"
              className="inline-flex items-center gap-2 bg-white text-orange-500 font-bold text-sm px-6 py-3 rounded-xl hover:bg-orange-50 transition-colors"
            >
              support@mocal.jp へメールする<span aria-hidden="true"> →</span>
            </Link>
          </div>
        </section>

        {/* フッター */}
        <footer className="border-t border-gray-100 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <p>© 2026 Entrust 合同会社（設立準備中）</p>
            <nav aria-label="関連ページ" className="flex gap-4">
              <Link href="/privacy" className="hover:text-gray-600">
                プライバシーポリシー
              </Link>
              <Link href="/tokushoho" className="hover:text-gray-600">
                特定商取引法
              </Link>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  )
}
