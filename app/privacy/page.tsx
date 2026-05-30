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
        <p className="text-xs text-gray-400">最終更新日：<time dateTime="2026-05-30">2026年5月30日</time></p>

        <section className="mt-6 space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            津越 大輔（屋号：Entrust、以下「当事業者」）は、mocal（以下「本サービス」）の運営にあたり、
            ユーザーの個人情報を以下のとおり取り扱います。本サービスは飲食店のテイクアウト事前注文 /
            決済導線を提供する取次事業者であり、各商品の販売者は本サービスを通じて出店している各店舗です（
            <Link href="/tokushoho" className="text-orange-500 hover:underline">特定商取引法に基づく表示</Link>
            を参照）。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">1. 事業者情報</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>事業者名：津越 大輔（屋号：Entrust）</li>
            <li>所在地：埼玉県越谷市瓦曽根1-21-33</li>
            <li>代表者：津越 大輔</li>
            <li>連絡先：<a href="mailto:support@mocal.jp" className="text-orange-500 hover:underline">support@mocal.jp</a></li>
          </ul>
          <p className="text-xs text-gray-500">
            ※ 法人化（Entrust 合同会社設立）に伴い、本項目は法人情報に更新予定です。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">2. 取得する個人情報</h2>
          <p>本サービスは以下の情報を取得することがあります。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>店舗オーナーの氏名・メールアドレス・電話番号（店舗登録時）</li>
            <li>顧客の注文内容・受取情報・決済情報（決済情報は決済処理事業者が処理・保管）</li>
            <li>お問い合わせ時に入力された氏名・メールアドレス・お問い合わせ内容</li>
            <li>プッシュ通知の購読情報（エンドポイント・暗号化キー）</li>
            <li>アクセスログ（IPアドレス・ブラウザ情報・操作ログ）</li>
            <li>顧客識別のための匿名セッション情報（注文管理に必要な期間のみ保持）</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">3. 利用目的</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>注文の受付・管理・通知</li>
            <li>各店舗（販売者）への注文情報の提供（取次事業者としての役務遂行）</li>
            <li>決済処理および返金対応</li>
            <li>お問い合わせへの対応</li>
            <li>サービスの改善・障害対応・不正利用の防止</li>
            <li>法令に基づく対応</li>
          </ul>
          <p className="text-xs text-gray-500">
            ※ 上記目的の達成に必要な範囲で、業務の一部を外部サービスに委託することがあります。委託先には
            個人情報保護法に基づき適切な監督を行います。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">4. 安全管理措置の概要</h2>
          <p>当事業者は、個人情報の漏えい・滅失・毀損の防止のため、以下の措置を講じています。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>通信の暗号化（HTTPS / TLS）</li>
            <li>データベースのアクセス制御（Row Level Security による行単位の権限管理）</li>
            <li>管理権限の最小化・多要素認証の利用</li>
            <li>Content Security Policy 等のセキュリティヘッダーの適用</li>
            <li>エラー監視ログから個人情報を除外する仕組み（PII sanitize）</li>
          </ul>

          <h2 className="text-base font-semibold text-gray-900 mt-6">5. Cookie・セッション</h2>
          <p>
            本サービスは認証セッションの管理および顧客識別のため Cookie を使用します。
            ブラウザの設定で Cookie を無効にすると、注文・お問い合わせ等の一部機能が利用できなくなる場合があります。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">6. 個人情報の保管期間</h2>
          <p>
            個人情報は、利用目的の達成に必要な期間または法令の定める期間、適切に保管します。
            目的達成後、または保管期間経過後、合理的な範囲で速やかに消去または匿名化します。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">7. 開示・訂正・利用停止等の請求</h2>
          <p>
            ご本人または代理人からの保有個人データの開示、訂正、追加、削除、利用停止、第三者提供の停止等の
            ご請求については、下記窓口にてメールまたは書面にてお受けします。本人確認のためご本人を確認できる
            情報の提示をお願いする場合があります。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">8. お問い合わせ窓口</h2>
          <p>
            個人情報の取り扱いに関するお問い合わせは、
            <a href="mailto:support@mocal.jp" className="text-orange-500 hover:underline">
              support@mocal.jp
            </a>
            までご連絡ください。
          </p>

          <h2 className="text-base font-semibold text-gray-900 mt-6">9. ポリシーの変更</h2>
          <p>
            本ポリシーは、法令の改正またはサービスの変更に応じて改定することがあります。
            改定後のポリシーは本ページにて公開し、本ページ冒頭の「最終更新日」を更新します。
          </p>
        </section>
      </main>
    </div>
  )
}
