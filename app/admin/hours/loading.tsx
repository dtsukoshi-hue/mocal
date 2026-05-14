export default function HoursLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="h-4 bg-gray-200 rounded w-40 animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100">
                <div className="w-6 h-5 bg-gray-200 rounded animate-pulse" />
                <div className="w-16 h-5 bg-gray-200 rounded animate-pulse" />
                <div className="flex-1 h-8 bg-gray-200 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-11 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </main>
    </div>
  )
}
