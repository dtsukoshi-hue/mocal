export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-20 bg-gray-200 rounded" />
        </div>
      </header>
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {/* 検索バー スケルトン */}
        <div className="flex gap-2 animate-pulse">
          <div className="flex-1 h-10 bg-gray-100 rounded-lg" />
          <div className="h-10 w-14 bg-gray-200 rounded-lg" />
        </div>

        {/* フィルターチップ スケルトン */}
        <div className="flex flex-wrap gap-2 animate-pulse">
          {[56, 72, 76, 64, 76].map((w, i) => (
            <div key={i} className="h-7 bg-gray-200 rounded-full" style={{ width: w }} />
          ))}
        </div>

        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-4 space-y-2 animate-pulse">
            <div className="flex justify-between">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-4 w-14 bg-gray-200 rounded" />
            </div>
            <div className="h-3 w-36 bg-gray-100 rounded" />
          </div>
        ))}
      </main>
    </div>
  )
}
