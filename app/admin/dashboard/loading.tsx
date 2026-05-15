export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between animate-pulse">
          <div className="h-6 w-24 bg-gray-200 rounded" />
          <div className="flex items-center gap-3">
            {[40, 52, 44, 44, 28, 44, 52].map((w, i) => (
              <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: w }} />
            ))}
          </div>
        </div>
      </header>

      {/* KPI + 受付トグルスケルトン */}
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <div className="h-3 w-16 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <div className="h-3 w-16 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-16 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
            <div className="h-7 w-12 bg-gray-200 rounded-full" />
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 space-y-3 animate-pulse">
            <div className="flex justify-between">
              <div className="h-5 w-24 bg-gray-200 rounded" />
              <div className="h-5 w-16 bg-gray-200 rounded" />
            </div>
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-4 w-36 bg-gray-100 rounded" />
          </div>
        ))}
      </main>
    </div>
  )
}
