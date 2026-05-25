'use client'

import { useActionState, useState, useEffect, useRef, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { createOrderAction, type OrderState } from '@/app/actions/orders'
import PaymentForm from './PaymentForm'
import type { CartItem, CartCombo } from './MenuView'
import type { MenuItem, Store } from '@/lib/database.aliases'

// アップセル候補のカテゴリーキーワード判定
const SIDE_KEYWORDS = ['サイド', 'side']
const DRINK_KEYWORDS = ['ドリンク', '飲み物', 'drink']

function matchesAny(category: string | null | undefined, keywords: string[]): boolean {
  if (!category) return false
  const c = category.toLowerCase()
  return keywords.some(k => c.includes(k.toLowerCase()))
}

type MenuItemForUpsell = Pick<MenuItem, 'id' | 'name' | 'description' | 'price' | 'category' | 'emoji' | 'is_available'>

function UpsellGroup({
  title,
  items,
  onAdd,
}: {
  title: string
  items: MenuItemForUpsell[]
  onAdd: (item: MenuItemForUpsell) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-amber-700 mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onAdd(item)}
            className="w-full flex items-center justify-between bg-white rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors text-left border border-transparent hover:border-amber-300"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {item.emoji && <span aria-hidden="true">{item.emoji}</span>}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.description && (
                  <p className="text-[10px] text-gray-400 truncate">{item.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-xs text-gray-700">¥{item.price.toLocaleString()}</span>
              <span aria-hidden="true" className="w-6 h-6 rounded-full bg-amber-700 text-white flex items-center justify-center text-sm font-bold">＋</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

// datetime-local 用の YYYY-MM-DDTHH:mm を browser timezone (= JST 想定) で生成。
// toISOString() は UTC を返すため、`<input type="datetime-local">` の min/max が
// JST 表示と乖離する問題を回避する。
function toLocalDateTimeString(d: Date): string {
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

interface Props {
  store: Pick<Store, 'id' | 'name' | 'is_open' | 'wait_minutes'>
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  cartCombos: CartCombo[]
  setCartCombos: React.Dispatch<React.SetStateAction<CartCombo[]>>
  menuItems: MenuItemForUpsell[]
  onBack: () => void
}

export default function Cart({ store, cart, setCart, cartCombos, setCartCombos, menuItems, onBack }: Props) {
  const [state, action, pending] = useActionState<OrderState, FormData>(
    createOrderAction,
    undefined
  )
  const [step, setStep] = useState<'cart' | 'confirm'>('cart')
  const [pickupType, setPickupType] = useState<'standard' | 'scheduled'>('standard')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [customerNote, setCustomerNote] = useState<string>('')
  // datetime-local の min / max。マウント時に固定（インピュア関数 render 時呼び出し回避）。
  // server action 側の制限 (10 分以上先・3 時間以内) と整合させる。
  const [minPickupAt] = useState(() =>
    toLocalDateTimeString(new Date(Date.now() + 10 * 60_000))
  )
  const [maxPickupAt] = useState(() =>
    toLocalDateTimeString(new Date(Date.now() + 3 * 60 * 60_000))
  )
  const cartHeadingRef = useRef<HTMLHeadingElement>(null)
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null)
  const paymentHeadingRef = useRef<HTMLHeadingElement>(null)

  // 顧客セッションの確保は createOrderAction (server) 側で
  // ensureCustomerSession() に集約済み (lib/customer-session.ts)。
  // Cart は純粋に「form を提出する」だけ。auth ロジックを持たない。

  // step 切替時に対応する見出しへフォーカスを移動 (a11y)
  useEffect(() => {
    if (step === 'cart') cartHeadingRef.current?.focus()
    else confirmHeadingRef.current?.focus()
  }, [step])

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
  // 商品価格は税込前提（飲食店標準）。消費税 10% を内税で表示。
  const taxIncluded = Math.round(totalAmount - totalAmount / 1.1)
  const itemsQty = cart.reduce((sum, c) => sum + c.qty, 0)
  const combosQty = cartCombos.reduce((sum, cc) => sum + cc.qty, 0)
  const totalQty = itemsQty + combosQty
  const isCartEmpty = cart.length === 0 && cartCombos.length === 0
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

  // アップセル候補（ご一緒にいかが？）
  // カートに既にあるサイド/ドリンクは「もう買った」扱いで suggest しない。
  // カートに無いカテゴリーから sort_order 順で最大 3 件ずつ表示。
  const upsellSuggestions = useMemo(() => {
    const cartIds = new Set(cart.map(c => c.menuItemId))
    const hasSide = cart.some(c => {
      const m = menuItems.find(x => x.id === c.menuItemId)
      return m && matchesAny(m.category, SIDE_KEYWORDS)
    })
    const hasDrink = cart.some(c => {
      const m = menuItems.find(x => x.id === c.menuItemId)
      return m && matchesAny(m.category, DRINK_KEYWORDS)
    })

    const sides: MenuItemForUpsell[] = []
    const drinks: MenuItemForUpsell[] = []
    for (const m of menuItems) {
      if (!m.is_available || cartIds.has(m.id)) continue
      if (!hasSide && matchesAny(m.category, SIDE_KEYWORDS)) sides.push(m)
      else if (!hasDrink && matchesAny(m.category, DRINK_KEYWORDS)) drinks.push(m)
    }
    return { sides: sides.slice(0, 3), drinks: drinks.slice(0, 3) }
  }, [cart, menuItems])

  const addToCartFromUpsell = (item: MenuItemForUpsell) => {
    setCart(prev => {
      const totalQ = prev.reduce((sum, c) => sum + c.qty, 0)
      if (totalQ >= MAX_QTY_TOTAL) return prev
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        if (existing.qty >= MAX_QTY_PER_ITEM) return prev
        return prev.map(c =>
          c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [...prev, {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        qty: 1,
        emoji: item.emoji,
      }]
    })
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

  // ===== Step 1: カート（数量編集・アップセル） =====
  if (step === 'cart') {
    return (
      <div className="min-h-screen bg-stone-50 pb-32">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={onBack} className="text-amber-600 text-sm font-medium">
              <span aria-hidden="true">← </span>メニューに戻る
            </button>
            <h1 ref={cartHeadingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">カート</h1>
          </div>
        </header>

        <main id="main-content" className="max-w-lg mx-auto px-4 py-4 space-y-4">
          {/* 個別アイテム */}
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

          {isCartEmpty && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-12 text-center text-sm text-gray-400">
              カートは空です
            </div>
          )}

          {/* 簡易合計 (内訳は Step 2 で表示) */}
          {!isCartEmpty && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">
                合計
                <span className="text-xs text-gray-400 ml-2">({totalQty}点)</span>
              </span>
              <span className="text-base font-bold text-gray-900">
                ¥{totalAmount.toLocaleString()}
              </span>
            </div>
          )}

          {itemsQty >= MAX_QTY_TOTAL && (
            <div role="status" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700">
              1回の注文は最大{MAX_QTY_TOTAL}点までです
            </div>
          )}

          {/* ご一緒にいかが？（アップセル候補・カートが空でないときのみ） */}
          {!isCartEmpty && itemsQty < MAX_QTY_TOTAL && (upsellSuggestions.sides.length > 0 || upsellSuggestions.drinks.length > 0) && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-800">🎁 ご一緒にいかが？</p>
              {upsellSuggestions.sides.length > 0 && (
                <UpsellGroup title="サイド" items={upsellSuggestions.sides} onAdd={addToCartFromUpsell} />
              )}
              {upsellSuggestions.drinks.length > 0 && (
                <UpsellGroup title="ドリンク" items={upsellSuggestions.drinks} onAdd={addToCartFromUpsell} />
              )}
            </div>
          )}
        </main>

        <div className="fixed bottom-6 left-0 right-0 px-4">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setStep('confirm')}
              disabled={isCartEmpty}
              className="w-full rounded-2xl bg-amber-600 text-white font-bold py-4 shadow-lg disabled:opacity-60 hover:bg-amber-700 transition-colors"
            >
              会計へ進む（¥{totalAmount.toLocaleString()}）
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Step 2: 注文確認（受取方法・お支払い） =====
  const canSubmit = !pending && !isCartEmpty && (pickupType === 'standard' || !!scheduledAt)

  return (
    <div className="min-h-screen bg-stone-50 pb-40">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => setStep('cart')} className="text-amber-600 text-sm font-medium">
            <span aria-hidden="true">← </span>カートに戻る
          </button>
          <h1 ref={confirmHeadingRef} tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">注文を確認</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-4 py-4 space-y-4">
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
              onClick={() => setPickupType('scheduled')}
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
            <div className="pt-1 space-y-1">
              <label htmlFor="scheduled-at" className="block text-xs text-gray-500">
                受取日時
              </label>
              <input
                id="scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={minPickupAt}
                max={maxPickupAt}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-[10px] text-gray-400">
                10分後〜3時間以内で指定してください
              </p>
            </div>
          )}
        </div>

        {/* 注文内容（read-only） */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-xs font-semibold text-gray-500">注文内容</p>
            <button
              type="button"
              onClick={() => setStep('cart')}
              className="text-xs text-amber-700 hover:underline"
            >
              編集
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {cartCombos.map(cc => {
              const baseSum = cc.items.reduce((s, ci) => s + ci.price * ci.qty, 0)
              const unitPrice = baseSum + cc.priceDelta
              return (
                <div key={cc.comboId} className="px-4 py-3 bg-amber-50/50 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-amber-900 min-w-0">
                      <span aria-hidden="true">🎁 </span>{cc.name}
                      <span className="text-amber-700 ml-1">×{cc.qty}</span>
                    </span>
                    <span className="text-sm text-amber-900 shrink-0">
                      ¥{(unitPrice * cc.qty).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700/80">
                    {cc.items.map(ci => `${ci.name}×${ci.qty}`).join('・')}
                  </p>
                </div>
              )
            })}
            {cart.map(item => (
              <div key={item.menuItemId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  {item.emoji && <span aria-hidden="true">{item.emoji}</span>}
                  <span className="text-sm text-gray-900 truncate">
                    {item.name}
                    <span className="text-gray-400 ml-1">×{item.qty}</span>
                  </span>
                </div>
                <span className="text-sm text-gray-600 shrink-0">
                  ¥{(item.price * item.qty).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
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

        {/* お支払い内訳 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 mb-1">お支払い</p>
          <div className="flex justify-between text-sm text-gray-600">
            <span>小計</span>
            <span>¥{totalAmount.toLocaleString()}</span>
          </div>
          {totalAmount > 0 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>うち消費税（10%）</span>
              <span>¥{taxIncluded.toLocaleString()}</span>
            </div>
          )}
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
              <input type="hidden" name="scheduledAt" value={new Date(scheduledAt).toISOString()} />
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
              {pending
                ? '準備中...'
                : pickupType === 'scheduled' && !scheduledAt
                  ? '受取日時を選択してください'
                  : `注文を確定する（¥${totalAmount.toLocaleString()}）`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
