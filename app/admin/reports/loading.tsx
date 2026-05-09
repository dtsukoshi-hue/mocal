export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-20 bg-gray-200 rounded" />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white rounded-xl shadow-sm h-10 animate-pulse" />
        <div className="flex justify-between animate-pulse">
          <div className="h-8 w-16 bg-gray-100 rounded" />
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-8 w-16 bg-gray-100 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
              <div className="h-3 w-12 bg-gray-100 rounded mb-2" />
              <div className="h-8 w-20 bg-gray-200 rounded" />
            </div>
          ))}
          <div className="bg-white rounded-xl shadow-sm p-4 animate-pulse col-span-2">
            <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
            <div className="h-8 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      </main>
    </div>
  )
}
