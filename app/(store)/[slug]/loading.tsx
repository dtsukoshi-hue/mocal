export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 animate-pulse">
          <div className="h-6 w-32 bg-gray-200 rounded mb-1" />
          <div className="h-4 w-48 bg-gray-100 rounded mb-1" />
          <div className="flex items-center gap-2 mt-1">
            <div className="h-5 w-14 bg-gray-200 rounded-full" />
            <div className="h-4 w-12 bg-gray-100 rounded" />
          </div>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {['カテゴリA', 'カテゴリB'].map(cat => (
          <section key={cat} className="animate-pulse">
            <div className="h-4 w-16 bg-gray-200 rounded mb-3" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl px-4 py-3 shadow-sm flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                    <div>
                      <div className="h-4 w-28 bg-gray-200 rounded mb-1" />
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                  </div>
                  <div className="h-5 w-14 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
