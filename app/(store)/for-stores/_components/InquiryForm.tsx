'use client'

import { useActionState, useRef, useEffect } from 'react'
import { submitInquiryAction, type InquiryState } from '@/app/actions/inquiries'

export default function InquiryForm() {
  const [state, action, pending] = useActionState<InquiryState, FormData>(
    submitInquiryAction,
    undefined
  )
  const formRef = useRef<HTMLFormElement>(null)

  // 送信成功時にフォームをリセット
  useEffect(() => {
    if (state && 'success' in state) {
      formRef.current?.reset()
    }
  }, [state])

  const isSuccess = state && 'success' in state
  const errorMessage = state && 'error' in state ? state.error : null

  return (
    <form ref={formRef} action={action} className="space-y-4 text-left">
      <div>
        <label htmlFor="inquiry-store-name" className="block text-xs font-semibold text-gray-700 mb-1">
          店舗名 <span className="text-red-600">*</span>
        </label>
        <input
          id="inquiry-store-name"
          name="store_name"
          type="text"
          required
          maxLength={200}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div>
        <label htmlFor="inquiry-name" className="block text-xs font-semibold text-gray-700 mb-1">
          ご担当者名 <span className="text-red-600">*</span>
        </label>
        <input
          id="inquiry-name"
          name="name"
          type="text"
          required
          maxLength={100}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div>
        <label htmlFor="inquiry-email" className="block text-xs font-semibold text-gray-700 mb-1">
          メールアドレス <span className="text-red-600">*</span>
        </label>
        <input
          id="inquiry-email"
          name="email"
          type="email"
          required
          maxLength={254}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div>
        <label htmlFor="inquiry-message" className="block text-xs font-semibold text-gray-700 mb-1">
          お問い合わせ内容 (任意)
        </label>
        <textarea
          id="inquiry-message"
          name="message"
          rows={4}
          maxLength={2000}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="text-xs text-red-600">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-white text-amber-600 font-bold text-sm py-3 shadow-sm hover:bg-amber-50 transition-colors disabled:opacity-60"
      >
        {pending ? '送信中...' : '送信する'}
      </button>

      {isSuccess && (
        <p role="status" className="text-xs text-white text-center">
          お問い合わせを受け付けました。1〜2 営業日以内にご返信します。
        </p>
      )}
    </form>
  )
}
