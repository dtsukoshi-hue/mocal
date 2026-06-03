'use client'

import { useActionState } from 'react'
import { resumeStoreCreationAction, type OnboardingState } from '@/app/actions/onboarding'
import Link from 'next/link'

const ERROR_LABELS: Record<string, string> = {
  slug_taken: '前回試行時に URL が他のユーザに使われていました。別の URL を選んでやり直してください。',
  server: '前回試行時にサーバーエラーが発生しました。再試行してください。',
}

interface Props {
  storeName: string
  slug: string
  errorCode?: string
  errorCount: number
}

export default function ResumeUI({ storeName, slug, errorCode, errorCount }: Props) {
  const [state, formAction, isPending] = useActionState<OnboardingState, FormData>(
    resumeStoreCreationAction,
    undefined
  )

  const queryError = errorCode ? ERROR_LABELS[errorCode] ?? null : null
  const actionError = state && 'error' in state ? state.error : null

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <span className="text-2xl font-bold text-gray-900">
              mo<span className="text-orange-500">cal</span>
            </span>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">店舗作成を再試行</h1>
          <p className="text-sm text-gray-500 mt-1">
            前回のメール確認後に店舗作成が完了していません
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {queryError && (
            <div role="alert" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              {queryError}
            </div>
          )}
          {actionError && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">店舗名</span>
              <strong className="text-gray-900">{storeName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">店舗 URL</span>
              <strong className="text-gray-900">mocal.jp/{slug}</strong>
            </div>
            {errorCount > 0 && (
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-gray-500">失敗回数</span>
                <span className="text-gray-700">{errorCount} 回</span>
              </div>
            )}
          </div>

          <form action={formAction}>
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50 transition-colors shadow-sm"
            >
              {isPending ? '処理中…' : 'この内容で店舗を作成する'}
            </button>
          </form>

          {errorCode === 'slug_taken' && (
            <p className="text-xs text-gray-500 text-center">
              別の URL で登録したい場合は{' '}
              <Link href="/onboarding" className="text-orange-500 hover:underline">
                最初からやり直す
              </Link>
            </p>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          <Link href="/admin/dashboard" className="text-orange-500 hover:underline font-medium">
            管理画面に戻る
          </Link>
        </p>
      </div>
    </main>
  )
}
