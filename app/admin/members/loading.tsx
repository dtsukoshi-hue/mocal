export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-24 bg-gray-200 rounded" />
        </div>
      </header>
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="h-9 bg-gray-100 rounded-lg" />
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden animate-pulse">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center justify-between px-5 py-4 border-b last:border-0">
              <div className="space-y-1.5">
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
