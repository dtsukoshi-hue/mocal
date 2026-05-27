import Link from 'next/link'

export const metadata = {
  title: '特定商取引法に基づく表示 | mocal',
}


const rows: { label: string; value: string }[] = [
  { label: '販売業者',       value: '津越 大輔（屋号：Entrust）' },
  { label: '代表責任者',     value: '津越 大輔' },
  { label: '所在地',         value: '埼玉県越谷市瓦曽根1-21-33' },
  { label: '電話番号',       value: '090-4159-6828' },
  { label: 'メールアドレス', value: 'd.tsukoshi@gmail.com' },
  { label: '販売価格',       value: '各店舗のメニューに表示の金額（消費税込）' },
  { label: '支払方法',       value: 'クレジットカード（Visa / Mastercard / Amex / JCB）、Apple Pay、Google Pay' },
  { label: '支払時期',       value: '注文確定時に即時決済' },
  { label: '商品の引渡し時期', value: '注文受理後、各店舗が指定する待ち時間内に店頭にてお渡し' },
  { label: '返品・キャンセル', value: '店舗が注文を受付するまでは、顧客側でキャンセル可能（決済額は全額自動返金）。受付後の顧客側キャンセルは不可ですので、店舗にお問い合わせください。店舗側都合のキャンセル時は全額返金いたします。' },
  { label: '動作環境',       value: 'モダンブラウザ（Chrome / Safari / Firefox 最新版）' },
]

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
        <p className="text-xs text-gray-400 mb-6">最終更新日：<time dateTime="2026-05-27">2026年5月27日</time></p>

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
      </main>
    </div>
  )
}
