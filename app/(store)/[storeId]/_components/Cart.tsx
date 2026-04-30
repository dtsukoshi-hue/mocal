'use client'

import { useActionState, useMemo, useState } from 'react'
import type { Stripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { createOrderAction, type OrderState } from '@/app/actions/orders'
import PaymentForm from './PaymentForm'
import type { CartItem } from './MenuView'
import type { Store } from '@/lib/database.types'

// Stripe.js (~100KB) はカート閲覧時には不要なので、決済画面に進んだ時点で
// dynamic import でロードする。
let _stripePromise: Promise<Stripe | null> | null = null
function getStripePromise(): Promise<Stripe | null> {
  if (_stripePromise) return _stripePromise
  _stripePromise = import('@stripe/stripe-js').then((m) =>
    m.loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  )
  return _stripePromise
}

interface Props {
  store: Pick<Store, 'id' | 'name' | 'is_open' | 'wait_minutes'>
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  onBack: () => void
}

export default function Cart({ store, cart, setCart, onBack }: Props) {
  const [state, action, pending] = useActionState<OrderState, FormData>(
    createOrderAction,
    undefined
  )
  const [customerNote, setCustomerNote] = useState('')
  const [pickupType, setPickupType] = useState<'standard' | 'scheduled'>('standard')
  const [scheduledAt, setScheduledAt] = useState('')
  // datetime-local input の min（30 分先以降）— マウント時に固定して Cannot call impure function during render を回避
  const [minPickupAt] = useState(
    () => new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16)
  )

  const totalAmount = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  // 商品価格は税込前提（飲食店標準）。消費税 10% を内税で表示。
  // 軽減税率 8% を採用する場合はここを変更。
  const taxIncluded = Math.round(totalAmount - totalAmount / 1.1)

  const updateQty = (menuItemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.menuItemId === menuItemId ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    )
  }

  // PaymentIntent 作成完了 → Stripe Elements を表示（ここで初めて Stripe.js を取得）
  const isPaying = state && 'clientSecret' in state
  const stripePromise = useMemo(() => (isPaying ? getStripePromise() : null), [isPaying])

  if (state && 'clientSecret' in state) {
    return (
      <div className="min-h-screen bg-stone-50 pb-10">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4">
            <h1 className="text-lg font-bold text-gray-900">お支払い</h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4">
          <Elements
            stripe={stripePromise!}
            options={{ clientSecret: state.clientSecret, locale: 'ja' }}
          >
            <PaymentForm
              orderId={state.orderId}
              orderNumber={state.orderNumber}
              totalAmount={totalAmount}
            />
          </Elements>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-amber-700 text-sm font-medium">
            ← メニューに戻る
          </button>
          <h1 className="text-lg font-bold text-gray-900">注文を確認</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* 受取方法 */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500">受取方法</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPickupType('standard')}
              className={`text-left rounded-xl px-4 py-3 transition-colors ${
                pickupType === 'standard'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <p className="text-sm font-bold">スタンダード</p>
              <p className={`text-[11px] mt-0.5 ${pickupType === 'standard' ? 'text-white/80' : 'text-gray-500'}`}>
                注文後すぐに準備<br />約{store.wait_minutes}分で受取
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPickupType('scheduled')}
              className={`text-left rounded-xl px-4 py-3 transition-colors ${
                pickupType === 'scheduled'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <p className="text-sm font-bold">日時指定</p>
              <p className={`text-[11px] mt-0.5 ${pickupType === 'scheduled' ? 'text-white/80' : 'text-gray-500'}`}>
                受取日時を<br />予約する
              </p>
            </button>
          </div>
          {pickupType === 'scheduled' && (
            <div className="pt-1">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={minPickupAt}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                30分後以降の日時を指定してください
              </p>
            </div>
          )}
        </div>

        {/* 注文内容 */}
        <div className="bg-white rounded-xl shadow-sm">
          <p className="text-xs font-semibold text-gray-500 px-4 pt-3 pb-2">注文内容</p>
          <div className="divide-y divide-gray-100">
            {cart.map(item => (
              <div key={item.menuItemId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  {item.emoji && <span>{item.emoji}</span>}
                  <span className="text-sm text-gray-900 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => updateQty(item.menuItemId, -1)}
                    aria-label="減らす"
                    className="w-7 h-7 rounded-full border text-gray-600 flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold w-4 text-center">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.menuItemId, +1)}
                    aria-label="増やす"
                    className="w-7 h-7 rounded-full border text-gray-600 flex items-center justify-center"
                  >
                    ＋
                  </button>
                  <span className="text-sm text-gray-600 w-20 text-right">
                    ¥{(item.price * item.qty).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 備考欄（アレルギー・辛さ・その他要望） */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 space-y-2">
          <label htmlFor="customer-note" className="block text-sm font-medium text-gray-700">
            ご要望（任意）
          </label>
          <textarea
            id="customer-note"
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="アレルギーや辛さなどあればご記入ください"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
          <p className="text-xs text-gray-400 text-right">
            {customerNote.length} / 200
          </p>
        </div>

        {/* お支払い内訳 */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 mb-1">お支払い</p>
          <div className="flex justify-between text-sm text-gray-600">
            <span>小計</span>
            <span>¥{totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>うち消費税（10%）</span>
            <span>¥{taxIncluded.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-gray-100">
            <span className="text-sm font-bold text-gray-900">合計</span>
            <span className="text-base font-bold text-gray-900">
              ¥{totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-400 px-2">
          決済は SSL/TLS で保護されています。カード情報は Stripe が管理し、当サービスには保存されません。
        </p>

        {state && 'error' in state && (
          <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-600">
            {state.error}
          </div>
        )}
      </main>

      <div className="fixed bottom-6 left-0 right-0 px-4">
        <div className="max-w-lg mx-auto">
          <form action={action}>
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="pickupType" value={pickupType} />
            {pickupType === 'scheduled' && scheduledAt && (
              <input type="hidden" name="scheduledAt" value={new Date(scheduledAt).toISOString()} />
            )}
            <input type="hidden" name="customerNote" value={customerNote} />
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(cart.map(c => ({
                menuItemId: c.menuItemId,
                name: c.name,
                price: c.price,
                qty: c.qty,
              })))}
            />
            <button
              type="submit"
              disabled={pending || cart.length === 0 || (pickupType === 'scheduled' && !scheduledAt)}
              className="w-full rounded-2xl bg-amber-700 text-white font-bold py-4 shadow-lg disabled:opacity-60 hover:bg-amber-800 transition-colors"
            >
              {pending
                ? '準備中...'
                : pickupType === 'scheduled' && !scheduledAt
                  ? '受取日時を選択してください'
                  : `¥${totalAmount.toLocaleString()} を支払う`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
