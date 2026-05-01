'use client'

import Link from 'next/link'

interface ReceiptOrder {
  id: string
  order_number: number
  status: string
  total_amount: number
  created_at: string
  ready_at: string | null
  stripe_receipt_url: string | null
  stores: { name: string } | null
  order_items: { name: string; qty: number; price: number; combo_id: string | null; combo_label: string | null }[]
}

export default function ReceiptView({ order }: { order: ReceiptOrder }) {
  const tax = Math.round(order.total_amount - order.total_amount / 1.1)
  const subtotal = order.total_amount

  function handlePrint() {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <div className="min-h-screen bg-stone-50 print:bg-white">
      <header className="bg-white border-b border-gray-100 print:hidden">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link
            href={`/orders/${order.id}`}
            className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← 戻る
          </Link>
          <button
            onClick={handlePrint}
            className="text-sm font-semibold bg-amber-700 hover:bg-amber-800 text-white px-4 py-1.5 rounded-lg"
          >
            📄 印刷 / PDF保存
          </button>
        </div>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-4 py-6">
        <article className="bg-white rounded-2xl shadow-sm p-8 print:shadow-none print:rounded-none print:p-4 space-y-6">
          <header className="text-center border-b border-gray-200 pb-4">
            <h1 className="text-2xl font-bold text-gray-900 tracking-wide">領収書</h1>
            <p className="text-xs text-gray-500 mt-1">RECEIPT</p>
          </header>

          <section>
            <p className="text-xs text-gray-500">発行店舗</p>
            <p className="text-base font-semibold text-gray-900">{order.stores?.name ?? ''}</p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">注文番号</p>
              <p className="font-bold text-gray-900 tabular-nums">#{order.order_number}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">ご利用日時</p>
              <p className="text-gray-900">
                {new Date(order.created_at).toLocaleString('ja-JP')}
              </p>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              ご利用明細
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-bold text-gray-500">商品</th>
                  <th className="text-right py-2 text-xs font-bold text-gray-500">数量</th>
                  <th className="text-right py-2 text-xs font-bold text-gray-500">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.order_items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-900">{item.name}</td>
                    <td className="py-2 text-right text-gray-700 tabular-nums">{item.qty}</td>
                    <td className="py-2 text-right text-gray-900 tabular-nums">
                      ¥{(item.price * item.qty).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="border-t border-gray-200 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>小計</span>
              <span className="tabular-nums">¥{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>うち消費税（10%）</span>
              <span className="tabular-nums">¥{tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 mt-2 border-t border-gray-200">
              <span className="font-bold text-gray-900">合計</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">
                ¥{order.total_amount.toLocaleString()}
              </span>
            </div>
          </section>

          {order.stripe_receipt_url && (
            <section className="border-t border-gray-200 pt-3 print:hidden">
              <a
                href={order.stripe_receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm font-semibold text-amber-700 hover:underline"
              >
                Stripe 公式レシートを開く →
              </a>
              <p className="text-[10px] text-gray-400 text-center mt-1">
                銀行明細との突合や経費精算にご利用いただけます
              </p>
            </section>
          )}

          <footer className="text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
            <p>この領収書は mocal が発行するお支払い証明です。</p>
            <p>領収書の再発行はアプリから可能です。</p>
          </footer>
        </article>
      </main>
    </div>
  )
}
