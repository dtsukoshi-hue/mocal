import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase-server'
import PrintButton from './_components/PrintButton'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, stores(name)')
    .eq('id', id)
    .single()

  if (!order) return { title: '領収書 | mocal' }
  const storeName = (order.stores as { name: string } | null)?.name ?? ''
  return {
    title: `領収書 #${order.order_number} — ${storeName} | mocal`,
    robots: { index: false },
  }
}

export default async function ReceiptPage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      pickup_type,
      scheduled_at,
      created_at,
      stripe_receipt_url,
      stores(name),
      order_items(name, qty, price)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  // 領収書は completed または refunded のみ表示
  if (!['completed', 'refunded'].includes(order.status)) {
    return (
      <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-4" aria-hidden="true">⏳</div>
          <p className="text-gray-600 text-sm">領収書は注文の受取完了後に発行されます。</p>
          <Link
            href={`/orders/${id}`}
            className="mt-4 inline-block text-sm text-orange-600 underline"
          >
            注文状況を確認する
          </Link>
        </div>
      </main>
    )
  }

  const storeName = (order.stores as { name: string } | null)?.name ?? '店舗'
  const orderItems = (order.order_items ?? []) as { name: string; qty: number; price: number }[]

  const issuedAt = new Date(order.created_at)
  const dateStr = issuedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  })
  const timeStr = issuedAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* ナビゲーション（印刷時非表示） */}
      <div className="print:hidden max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
        <Link
          href={`/orders/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 注文状況に戻る
        </Link>
        <PrintButton />
      </div>

      {/* 領収書本体 */}
      <main id="main-content" className="max-w-lg mx-auto px-4 pb-12 print:px-0 print:pb-0">
        <div className="bg-white rounded-2xl shadow-sm p-8 print:shadow-none print:rounded-none space-y-6">
          {/* ヘッダー */}
          <div className="text-center space-y-1 border-b pb-6">
            <p className="text-xs text-gray-400 uppercase tracking-widest">領収書</p>
            <h1 className="text-2xl font-bold text-gray-900">{storeName}</h1>
            <p className="text-sm text-gray-500">
              {dateStr} {timeStr}
            </p>
          </div>

          {/* 注文番号 */}
          <div className="flex justify-between text-sm text-gray-600">
            <span className="font-medium">注文番号</span>
            <span className="font-mono">#{order.order_number}</span>
          </div>

          {/* 明細 */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">内訳</p>
            <ul className="divide-y text-sm">
              {orderItems.map((item, i) => (
                <li key={i} className="flex justify-between py-2.5 text-gray-700">
                  <span>
                    {item.name}
                    <span className="text-gray-400 ml-1">× {item.qty}</span>
                  </span>
                  <span className="font-medium">¥{(item.price * item.qty).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 合計 */}
          <div className="border-t pt-4">
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>合計（税込）</span>
              <span>¥{order.total_amount.toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 text-right">カード決済済み</p>
          </div>

          {/* Stripe 公式領収書リンク */}
          {order.stripe_receipt_url && (
            <div className="border-t pt-4 text-center print:hidden">
              <a
                href={order.stripe_receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-600 underline"
              >
                Stripe 公式領収書を開く
                <span className="sr-only">（新しいタブで開きます）</span>
                <span aria-hidden="true"> →</span>
              </a>
            </div>
          )}

          {/* フッター */}
          <div className="border-t pt-4 text-center">
            <p className="text-xs text-gray-400">
              本書は電子領収書として有効です
            </p>
            <p className="text-xs text-gray-300 mt-1">mocal — テイクアウト事前注文</p>
          </div>
        </div>
      </main>
    </div>
  )
}
