import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
        <div className="text-4xl">🔍</div>
        <h1 className="text-lg font-bold text-gray-900">ページが見つかりません</h1>
        <p className="text-sm text-gray-500">
          指定された注文・店舗ページは存在しないか、移動した可能性があります。
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-gray-900 text-white text-sm font-semibold py-3 px-6 hover:bg-gray-700 transition-colors"
        >
          ホームへ戻る
        </Link>
      </div>
    </div>
  )
}
