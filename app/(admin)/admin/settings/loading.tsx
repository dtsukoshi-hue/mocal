export default function SettingsLoading() {
  const Section = ({ lines = 2 }: { lines?: number }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="px-5 py-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="h-[97px] bg-white border-b border-gray-200 shadow-sm" />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
        <Section lines={3} />
        <Section lines={2} />
        <Section lines={1} />
        {/* QR コードスケルトン */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="px-5 py-5 flex flex-col items-center gap-4">
            <div className="w-[214px] h-[214px] bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="flex gap-2 w-full max-w-xs">
              <div className="flex-1 h-9 bg-gray-100 rounded-lg animate-pulse" />
              <div className="flex-1 h-9 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
