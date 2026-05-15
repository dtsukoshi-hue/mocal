import Link from 'next/link'

export const metadata = {
  title: 'プライバシーポリシー | mocal',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm"><span aria-hidden="true">← </span>mocal</Link>
          <h1 className="text-lg font-bold text-gray-900">プライバシーポリシー</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-8 prose prose-sm prose-gray">
        <p className="text-xs text-gray-400">最終更新日：2026年5月9日</p>

        <section className="mt-6 space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            Entrust合同会社（以下「当社」）は、mocal（以下「本サービス」）の運営にあたり、
            ユーザーの個人情報を以下のとおり取り扱います。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">1. 収集する情報</h2>
          <p>本サービスでは以下の情報を収集することがあります。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>氏名・メールアドレス・電話番号（店舗登録時）</li>
            <li>注文履歴・決済情報（Stripe が処理・保管）</li>
            <li>プッシュ通知の購読情報（エンドポイント・暗号化キー）</li>
            <li>アクセスログ（IPアドレス・ブラウザ情報）</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">2. 利用目的</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>注文の受付・管理・通知</li>
            <li>決済処理および返金対応</li>
            <li>サービスの改善・不正利用の防止</li>
            <li>法令に基づく対応</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">3. 第三者提供</h2>
          <p>
            当社は、以下の場合を除き、個人情報を第三者に提供しません。
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ユーザーの同意がある場合</li>
            <li>決済処理のため Stripe, Inc. に提供する場合</li>
            <li>法令に基づき開示が必要な場合</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">4. 委託先サービス</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong>（データベース・認証）</li>
            <li><strong>Stripe</strong>（決済処理）</li>
            <li><strong>Vercel</strong>（ホスティング）</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">5. Cookie・ローカルストレージ</h2>
          <p>
            本サービスは認証セッションの管理のため Cookie を使用します。
            ブラウザの設定で Cookie を無効にすると、一部機能が利用できなくなる場合があります。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">6. 情報の保管・削除</h2>
          <p>
            個人情報は法令の定める期間または事業上必要な期間保管します。
            削除を希望される場合は下記連絡先までお問い合わせください。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">7. お問い合わせ</h2>
          <p>
            個人情報の取り扱いに関するお問い合わせは、
            <a href="mailto:support@mocal.jp" className="text-orange-500 hover:underline">
              support@mocal.jp
            </a>{' '}
            までご連絡ください。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">8. ポリシーの変更</h2>
          <p>
            本ポリシーは予告なく改定することがあります。改定後のポリシーは本ページにて公開します。
          </p>
        </section>
      </main>
    </div>
  )
}
