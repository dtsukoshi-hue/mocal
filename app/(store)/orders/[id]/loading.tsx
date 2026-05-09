export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 py-4 animate-pulse">
          <div className="h-4 w-16 bg-gray-100 rounded mb-1" />
          <div className="h-6 w-32 bg-gray-200 rounded" />
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-8 flex-1 space-y-6 w-full">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center animate-pulse">
          <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="h-6 w-24 bg-gray-200 rounded mx-auto mb-2" />
          <div className="h-4 w-48 bg-gray-100 rounded mx-auto" />
        </div>
        {/* PushSubscribeButton skeleton */}
        <div className="h-12 bg-white border border-orange-200 rounded-xl animate-pulse" />
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          {[1, 2].map(i => (
            <div key={i} className="flex justify-between py-2 border-b last:border-0">
              <div className="h-4 w-32 bg-gray-100 rounded" />
              <div className="h-4 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
