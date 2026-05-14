export default function HistoryLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="h-14 bg-white border-b border-gray-100" />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-14 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-2.5">
                  <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-14 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="mt-2 flex gap-3">
                <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
