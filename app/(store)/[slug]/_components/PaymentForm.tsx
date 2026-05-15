'use client'

import { useState } from 'react'
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

interface Props {
  orderId: string
  orderNumber: number
  totalAmount: number
}

export default function PaymentForm({ orderId, orderNumber, totalAmount }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // 決済完了後のリダイレクト先（Webhook で paid に更新される）
        return_url: `${window.location.origin}/orders/${orderId}`,
      },
    })

    // confirmPayment はリダイレクトするか即時エラーを返す
    if (error) {
      setErrorMessage(
        error.type === 'card_error' || error.type === 'validation_error'
          ? (error.message ?? '決済に失敗しました。')
          : '決済処理中にエラーが発生しました。'
      )
    }

    setIsLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm p-5">
        <p className="text-xs text-gray-500 mb-4">
          注文番号 #{orderNumber} ・ ¥{totalAmount.toLocaleString()}
        </p>
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {errorMessage && (
        <div role="alert" className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isLoading}
        className="w-full rounded-2xl bg-orange-500 text-white font-bold py-4 shadow-lg disabled:opacity-60 hover:bg-orange-600 transition-colors"
      >
        {isLoading ? '処理中...' : `¥${totalAmount.toLocaleString()} を支払う`}
      </button>
    </form>
  )
}
