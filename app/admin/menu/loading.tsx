export default function Loading() {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-24 bg-gray-200 rounded" />
        </div>
      </header>
      <main id="main-content" aria-busy="true" aria-label="メニュー管理を読み込み中" className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* AddMenuItemButton skeleton */}
        <div className="h-12 rounded-xl border-2 border-dashed border-gray-200 animate-pulse" />

        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
              <div className="flex flex-col gap-0.5 shrink-0">
                <div className="w-4 h-3 bg-gray-100 rounded" />
                <div className="w-4 h-3 bg-gray-100 rounded" />
              </div>
              <div className="w-8 h-8 bg-gray-200 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-14 bg-gray-100 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
