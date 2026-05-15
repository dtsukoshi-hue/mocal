import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200">404</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-700">ページが見つかりません</h1>
        <p className="mt-2 text-sm text-gray-500">
          URLが正しいか確認してください。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-orange-500 hover:underline"
        >
          トップへ戻る
        </Link>
      </div>
    </main>
  )
}
