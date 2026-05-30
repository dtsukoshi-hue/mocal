import Link from 'next/link'

export const metadata = {
  title: '特定商取引法に基づく表示 | mocal',
}

// mocal の取次サービスに関する事業者情報
const mocalRows: { label: string; value: string }[] = [
  { label: '役務提供事業者',   value: '津越 大輔（屋号：Entrust）' },
  { label: '代表責任者',       value: '津越 大輔' },
  { label: '所在地',           value: '埼玉県越谷市瓦曽根1-21-33' },
  { label: '電話番号',         value: '090-4159-6828' },
  { label: 'メールアドレス',   value: 'support@mocal.jp' },
  { label: '提供する役務',     value: '飲食店のテイクアウト事前注文プラットフォームの運営（場と決済導線の提供 / メニュー表示 / 注文管理 UI / お問い合わせ窓口）' },
  { label: '役務の提供時期',   value: '各店舗の出店期間中、24時間 365日で UI を提供' },
  { label: '動作環境',         value: 'モダンブラウザ（Chrome / Safari / Firefox 最新版）、JavaScript 有効、Cookie 有効。Stripe 決済画面の表示に Stripe.js が動作する環境が必要です。' },
]

// 各商品（食品）の販売に関する条件
const productRows: { label: string; value: string }[] = [
  { label: '販売者',           value: '各店舗（mocal を通じて出店している事業者）。各店舗の事業者情報および特定商取引法表示は、各店舗ページのフッタリンクからご確認ください。' },
  { label: '販売価格',         value: '各店舗のメニューに表示の金額（消費税込）' },
  { label: '商品代金以外に必要な費用', value: 'なし（消費税込、店頭引渡しのため配送料なし）' },
  { label: '支払方法',         value: 'クレジットカード（Visa / Mastercard / Amex / JCB）、Apple Pay、Google Pay（Stripe Connect 経由で各店舗に支払い）' },
  { label: '支払時期',         value: '注文確定時に即時決済' },
  { label: '商品の引渡し時期', value: '注文受理後、各店舗が指定する待ち時間内に店頭にてお渡し' },
  { label: '申込みの有効期間', value: '各店舗が指定する受取期限まで。受取期限を過ぎた注文は自動的に no_show 扱いとなり、原則として返金対象外となります。' },
  { label: '返品・キャンセル', value: '店舗が注文を受付するまでは、顧客側でキャンセル可能（決済額は全額自動返金）。受付後の顧客側キャンセルは不可ですので、店舗にお問い合わせください。店舗側都合のキャンセル時は全額返金いたします。' },
  { label: '不良品・異物混入等の対応', value: '商品の品質・安全性に関するご相談は、まず各店舗へお問い合わせください。緊急時または店舗対応が不十分な場合は、mocal の窓口（support@mocal.jp）もご利用いただけます。' },
  { label: '商品に関する問い合わせ', value: '各店舗（店舗ページに表示の連絡先からお問い合わせください）' },
]

function Table({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ label, value }) => (
            <tr key={label}>
              <th className="px-4 py-3 text-left text-gray-500 font-medium w-36 shrink-0 align-top">
                {label}
              </th>
              <td className="px-4 py-3 text-gray-700 leading-relaxed">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TokushohoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm"><span aria-hidden="true">← </span>mocal</Link>
          <h1 className="text-lg font-bold text-gray-900">特定商取引法に基づく表示</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-xs text-gray-400 mb-6">最終更新日：<time dateTime="2026-05-30">2026年5月30日</time></p>

        <section className="mb-8 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-gray-700 leading-relaxed">
          <p>
            mocal は、飲食店のテイクアウト事前注文 / 決済導線を提供する<strong className="font-semibold text-gray-900">取次事業者</strong>であり、商品（食品）の販売者ではありません。各商品の販売者は、mocal を通じて出店している各店舗です。
          </p>
          <p className="mt-2">
            各商品の特定商取引法表示は、<strong className="font-semibold text-gray-900">各店舗ページのフッタリンク</strong>からご確認ください。mocal 自身（取次サービス提供）に関する特定商取引法表示は以下のとおりです。
          </p>
        </section>

        <h2 className="text-base font-semibold text-gray-900 mb-3">1. mocal の取次サービスに関する表示</h2>
        <Table rows={mocalRows} />

        <h2 className="mt-8 text-base font-semibold text-gray-900 mb-3">2. 各商品（食品）の販売に関する表示</h2>
        <Table rows={productRows} />

        <h2 className="mt-8 text-base font-semibold text-gray-900 mb-3">3. 免責事項・関連事項</h2>
        <div className="bg-white rounded-xl shadow-sm px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-3">
          <div>
            <p className="font-medium text-gray-900">クーリングオフについて</p>
            <p className="mt-1">
              本サービスでの取引は、店頭での引渡しを伴うテイクアウト注文であり、特定商取引法上の通信販売
              （訪問販売 / 特定継続的役務提供 等）には該当しません。そのため、クーリングオフ制度の対象外と
              なります。キャンセルは上記「返品・キャンセル」欄の条件に従ってください。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">アレルゲン情報</p>
            <p className="mt-1">
              アレルゲン情報は各店舗の責任において表示・管理されます。各店舗ページのフッタに
              「アレルゲン情報」リンクがある場合は、当該リンク先をご確認ください。リンクが無い、または
              個別の確認が必要な場合は、各店舗へ直接お問い合わせください。mocal はリンクの取次のみを行います。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">食品の安全性・衛生管理</p>
            <p className="mt-1">
              各商品の販売者は各店舗です。食品衛生法その他関連法令の遵守、衛生管理、品質保証、表示責任は
              各店舗が負います。mocal は取次事業者として注文・決済の導線を提供するのみで、商品自体の
              安全性については販売者である各店舗にお問い合わせください。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">天災・不可抗力</p>
            <p className="mt-1">
              地震・台風等の天災、停電、通信障害、当事業者および各店舗の責に帰さない事由によるサービスの
              停止・遅延・注文不能等について、mocal は責任を負いません。当該事由による既決済注文の取扱いに
              ついては個別にご相談ください。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">個人情報の取扱い</p>
            <p className="mt-1">
              ご注文・お問い合わせ等で取得した個人情報の取扱いについては、
              <Link href="/privacy" className="text-orange-500 hover:underline">プライバシーポリシー</Link>
              をご確認ください。
            </p>
          </div>
        </div>

        <p className="mt-8 text-xs text-gray-400 leading-relaxed">
          ※ 法人化（Entrust 合同会社設立）に伴い、表 1 の役務提供事業者名・所在地等は法人情報に更新予定です。
        </p>
      </main>
    </div>
  )
}
