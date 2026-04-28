'use client'

import { useActionState, useMemo } from 'react'
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

  const totalAmount = cart.reduce((sum, c) => sum + c.price * c.qty, 0)

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
      <div className="min-h-screen bg-gray-50 pb-10">
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
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-orange-500 text-sm font-medium">
            ← メニューに戻る
          </button>
          <h1 className="text-lg font-bold text-gray-900">カート</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {cart.map(item => (
            <div key={item.menuItemId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {item.emoji && <span>{item.emoji}</span>}
                <span className="text-sm text-gray-900">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateQty(item.menuItemId, -1)}
                  className="w-7 h-7 rounded-full border text-gray-600 flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-sm font-semibold w-4 text-center">{item.qty}</span>
                <button
                  onClick={() => updateQty(item.menuItemId, +1)}
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

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex justify-between">
          <span className="text-sm font-medium text-gray-700">合計</span>
          <span className="text-base font-bold text-gray-900">
            ¥{totalAmount.toLocaleString()}
          </span>
        </div>

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
            <input type="hidden" name="pickupType" value="standard" />
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
              disabled={pending || cart.length === 0}
              className="w-full rounded-2xl bg-orange-500 text-white font-bold py-4 shadow-lg disabled:opacity-60 hover:bg-orange-600 transition-colors"
            >
              {pending ? '準備中...' : `¥${totalAmount.toLocaleString()} でお支払いへ`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
