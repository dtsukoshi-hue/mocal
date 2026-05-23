'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { createOrderAction, type OrderState } from '@/app/actions/orders'
import PaymentForm from './PaymentForm'
import type { CartItem, CartCombo } from './MenuView'
import type { Store } from '@/lib/database.aliases'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

// 30分単位の受取時刻スロットを生成（wait_minutes 以上後〜2時間後）
function generateTimeSlots(waitMinutes: number): { label: string; iso: string }[] {
  const slots: { label: string; iso: string }[] = []
  const now = new Date()
  // 最初のスロット: 店舗の待ち時間（最低15分）以上先を30分単位で切り上げ
  const minOffsetMs = Math.max(waitMinutes, 15) * 60_000
  const base = new Date(Math.ceil((now.getTime() + minOffsetMs) / (30 * 60_000)) * (30 * 60_000))
  for (let i = 0; i < 5; i++) {
    const t = new Date(base.getTime() + i * 30 * 60_000)
    slots.push({
      label: t.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }),
      iso: t.toISOString(),
    })
  }
  return slots
}

interface Props {
  store: Pick<Store, 'id' | 'name' | 'is_open' | 'wait_minutes'>
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  cartCombos: CartCombo[]
  setCartCombos: React.Dispatch<React.SetStateAction<CartCombo[]>>
  onBack: () => void
}

export default function Cart({ store, cart, setCart, cartCombos, setCartCombos, onBack }: Props) {
  const [state, action, pending] = useActionState<OrderState, FormData>(
    createOrderAction,
    undefined
  )
  const [pickupType, setPickupType] = useState<'standard' | 'scheduled'>('standard')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [customerNote, setCustomerNote] = useState<string>('')
  const timeSlots = generateTimeSlots(store.wait_minutes)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const paymentHeadingRef = useRef<HTMLHeadingElement>(null)

  // 顧客セッションの確保は createOrderAction (server) 側で
  // ensureCustomerSession() に集約済み (lib/customer-session.ts)。
  // Cart は純粋に「form を提出する」だけ。auth ロジックを持たない。

  // カート表示時にフォーカスを見出しへ移動（スクリーンリーダー・キーボードユーザー向け）
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // お支払い画面への遷移時にフォーカスを移動
  useEffect(() => {
    if (state && 'clientSecret' in state) {
      paymentHeadingRef.current?.focus()
    }
  }, [state])

  const itemsTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  const combosTotal = cartCombos.reduce((sum, cc) => {
    const baseSum = cc.items.reduce((s, ci) => s + ci.price * ci.qty, 0)
    return sum + (baseSum + cc.priceDelta) * cc.qty
  }, 0)
  const totalAmount = itemsTotal + combosTotal
  const itemsQty = cart.reduce((sum, c) => sum + c.qty, 0)
  const combosQty = cartCombos.reduce((sum, cc) => sum + cc.qty, 0)
  const totalQty = itemsQty + combosQty
  const MAX_QTY_PER_ITEM = 10
  const MAX_QTY_TOTAL = 30
  const MAX_COMBO_QTY = 99

  const updateQty = (menuItemId: string, delta: number) => {
    setCart(prev => {
      const next = prev
        .map(c => {
          if (c.menuItemId !== menuItemId) return c
          const newQty = Math.min(c.qty + delta, MAX_QTY_PER_ITEM)
          return { ...c, qty: newQty }
        })
        .filter(c => c.qty > 0)
      const nextTotal = next.reduce((sum, c) => sum + c.qty, 0)
      if (delta > 0 && nextTotal > MAX_QTY_TOTAL) return prev
      return next
    })
  }

  const updateComboQty = (comboId: string, delta: number) => {
    setCartCombos(prev =>
      prev
        .map(c => {
          if (c.comboId !== comboId) return c
          return { ...c, qty: Math.min(c.qty + delta, MAX_COMBO_QTY) }
        })
        .filter(c => c.qty > 0)
    )
  }

  // PaymentIntent 作成完了 → Stripe Elements を表示
  if (state && 'clientSecret' in state) {
    return (
      <div className="min-h-screen bg-stone-50 pb-10">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4">
            <h1 ref={paymentHeadingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">お支払い</h1>
          </div>
        </header>
        <main id="main-content" className="max-w-lg mx-auto px-4 py-4">
          <Elements
            stripe={stripePromise}
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

  const canSubmit = !pending && (cart.length > 0 || cartCombos.length > 0) && (pickupType === 'standard' || scheduledAt)

  return (
    <div className="min-h-screen bg-stone-50 pb-40">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-amber-600 text-sm font-medium">
            <span aria-hidden="true">← </span>メニューに戻る
          </button>
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">カート</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* 注文内容 */}
        {cart.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y">
            {cart.map(item => {
              const atItemMax = item.qty >= MAX_QTY_PER_ITEM
              const atTotalMax = itemsQty >= MAX_QTY_TOTAL
              return (
                <div key={item.menuItemId} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    {item.emoji && <span aria-hidden="true">{item.emoji}</span>}
                    <span className="text-sm text-gray-900">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      aria-label={`${item.name}の数量を1つ減らす`}
                      className="w-7 h-7 rounded-full border text-gray-600 flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold w-4 text-center" aria-label={`${item.qty}点`}>{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.menuItemId, +1)}
                      disabled={atItemMax || atTotalMax}
                      aria-label={`${item.name}の数量を1つ増やす`}
                      className="w-7 h-7 rounded-full border text-gray-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ＋
                    </button>
                    <span className="text-sm text-gray-600 w-20 text-right">
                      ¥{(item.price * item.qty).toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* コンボセット */}
        {cartCombos.length > 0 && (
          <div className="bg-amber-50/50 rounded-2xl shadow-sm border border-amber-200 divide-y divide-amber-100">
            {cartCombos.map(cc => {
              const baseSum = cc.items.reduce((s, ci) => s + ci.price * ci.qty, 0)
              const unitPrice = baseSum + cc.priceDelta
              const atComboMax = cc.qty >= MAX_COMBO_QTY
              return (
                <div key={cc.comboId} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {cc.emoji && <span aria-hidden="true">{cc.emoji}</span>}
                      <span className="text-sm font-bold text-amber-900 truncate">{cc.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => updateComboQty(cc.comboId, -1)}
                        aria-label={`${cc.name}の数量を1つ減らす`}
                        className="w-7 h-7 rounded-full border border-amber-300 text-amber-700 flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-sm font-semibold w-4 text-center text-amber-900" aria-label={`${cc.qty}セット`}>{cc.qty}</span>
                      <button
                        onClick={() => updateComboQty(cc.comboId, +1)}
                        disabled={atComboMax}
                        aria-label={`${cc.name}の数量を1つ増やす`}
                        className="w-7 h-7 rounded-full border border-amber-300 text-amber-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ＋
                      </button>
                      <span className="text-sm text-amber-900 w-20 text-right">
                        ¥{(unitPrice * cc.qty).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700/80 pl-1">
                    {cc.items.map(ci => `${ci.name}×${ci.qty}`).join('・')}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">
            合計
            <span className="text-xs text-gray-400 ml-2">({totalQty}点)</span>
          </span>
          <span className="text-base font-bold text-gray-900">
            ¥{totalAmount.toLocaleString()}
          </span>
        </div>

        {itemsQty >= MAX_QTY_TOTAL && (
          <div role="status" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700">
            1回の注文は最大{MAX_QTY_TOTAL}点までです
          </div>
        )}

        {/* 受取方法 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">受取方法</p>
          <div className="flex gap-2" role="group" aria-label="受取方法を選択">
            <button
              type="button"
              onClick={() => setPickupType('standard')}
              aria-pressed={pickupType === 'standard'}
              className={`flex-1 text-left rounded-xl px-4 py-3 transition-colors ${
                pickupType === 'standard'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              <p className="text-sm font-bold">スタンダード</p>
              <p className={`text-[11px] mt-0.5 ${pickupType === 'standard' ? 'text-white/80' : 'text-gray-500'}`}>
                注文後すぐに準備<br />約{store.wait_minutes}分で受取
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setPickupType('scheduled'); if (!scheduledAt) setScheduledAt(timeSlots[0]?.iso ?? '') }}
              aria-pressed={pickupType === 'scheduled'}
              className={`flex-1 text-left rounded-xl px-4 py-3 transition-colors ${
                pickupType === 'scheduled'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              <p className="text-sm font-bold">日時指定</p>
              <p className={`text-[11px] mt-0.5 ${pickupType === 'scheduled' ? 'text-white/80' : 'text-gray-500'}`}>
                受取日時を<br />予約する
              </p>
            </button>
          </div>

          {pickupType === 'scheduled' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">受取時刻を選んでください</p>
              {timeSlots.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="受取時刻を選択">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.iso}
                      type="button"
                      onClick={() => setScheduledAt(slot.iso)}
                      aria-pressed={scheduledAt === slot.iso}
                      className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                        scheduledAt === slot.iso
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'border-gray-300 text-gray-700 hover:border-amber-300'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p role="alert" className="text-xs text-red-600">
                  現在、日時指定での受取枠がありません。「スタンダード」をご利用ください。
                </p>
              )}
            </div>
          )}
        </div>

        {/* 注文メモ（アレルギー・要望） */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
          <label htmlFor="customer-note" className="text-sm font-medium text-gray-700">
            要望・メモ（任意）
          </label>
          <textarea
            id="customer-note"
            value={customerNote}
            onChange={e => setCustomerNote(e.target.value)}
            placeholder="例：ソースは少なめで、アレルギーはナッツ"
            rows={2}
            maxLength={200}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <p className="text-xs text-gray-400 text-right" aria-live="polite">
            {customerNote.length > 0 ? `${customerNote.length}/200` : ''}
          </p>
        </div>

        {state && 'error' in state && (
          <div role="alert" className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-600">
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
              <input type="hidden" name="scheduledAt" value={scheduledAt} />
            )}
            {customerNote.trim() && (
              <input type="hidden" name="customerNote" value={customerNote.trim()} />
            )}
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
            <input
              type="hidden"
              name="combos"
              value={JSON.stringify(cartCombos.map(cc => ({
                comboId: cc.comboId,
                qty: cc.qty,
              })))}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-amber-600 text-white font-bold py-4 shadow-lg disabled:opacity-60 hover:bg-amber-700 transition-colors"
            >
              {pending ? '準備中...' : `¥${totalAmount.toLocaleString()} でお支払いへ`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
