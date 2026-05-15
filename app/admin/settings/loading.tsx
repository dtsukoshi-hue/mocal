export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* StoreOpenToggle skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-3 w-28 bg-gray-100 rounded" />
            </div>
            <div className="h-7 w-12 bg-gray-200 rounded-full" />
          </div>
        </div>

        {/* StoreProfileForm skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4 animate-pulse">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-3 w-12 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 bg-gray-100 rounded" />
            <div className="h-20 bg-gray-100 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
          <div className="h-9 w-20 bg-gray-200 rounded-lg" />
        </div>

        {/* WaitMinutesForm skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4 animate-pulse">
          <div className="space-y-1.5">
            <div className="h-4 w-36 bg-gray-200 rounded" />
            <div className="h-3 w-48 bg-gray-100 rounded" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-5 w-12 bg-gray-100 rounded" />
            ))}
          </div>
          <div className="h-9 w-20 bg-gray-200 rounded-lg" />
        </div>

        {/* StoreImageUpload skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-5 animate-pulse">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="space-y-2">
            <div className="h-3 w-16 bg-gray-100 rounded" />
            <div className="aspect-square w-32 bg-gray-100 rounded-xl" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="aspect-video w-full max-w-xs bg-gray-100 rounded-xl" />
          </div>
        </div>

        {/* QRCode skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-56 bg-gray-100 rounded" />
          <div className="h-36 w-36 bg-gray-100 rounded" />
        </div>

        {/* Stripe skeleton */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3 animate-pulse">
          <div className="space-y-1.5">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-64 bg-gray-100 rounded" />
          </div>
          <div className="h-9 w-40 bg-gray-200 rounded-lg" />
        </div>
      </main>
    </div>
  )
}
