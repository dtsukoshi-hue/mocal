'use client'

import Link from 'next/link'

interface Props {
  email: string
}

export default function SentMessage({ email }: Props) {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <span className="text-2xl font-bold text-gray-900">
              mo<span className="text-orange-500">cal</span>
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-50">
              <span className="text-3xl" aria-hidden="true">📧</span>
            </div>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">確認メールを送信しました</h1>

          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            <strong className="text-gray-900 break-all">{email}</strong> 宛に確認メールを送信しました。
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left text-sm text-amber-800 mb-6">
            <p className="font-medium mb-1">次の操作:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>メール内の「メールアドレスを確認する」ボタンをクリック</li>
              <li>店舗の管理画面に自動でログインします</li>
            </ol>
          </div>

          <div className="text-xs text-gray-500 leading-relaxed space-y-1">
            <p>確認リンクは <strong>24 時間で失効</strong>します。</p>
            <p>メールが届かない場合は迷惑メールフォルダもご確認ください。</p>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 space-y-2">
            <p className="text-xs text-gray-400">
              メールが届かない場合は、メールアドレスを変更して再登録してください。
            </p>
            <Link
              href="/onboarding"
              className="inline-block text-sm text-orange-500 hover:underline font-medium"
            >
              最初からやり直す
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          すでに登録済みの方は{' '}
          <Link href="/admin/login" className="text-orange-500 hover:underline font-medium">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  )
}
