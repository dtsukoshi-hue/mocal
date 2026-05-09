export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-pulse">
        {/* タイトル */}
        <div className="text-center mb-8 space-y-2">
          <div className="h-7 w-48 bg-gray-200 rounded mx-auto" />
          <div className="h-4 w-56 bg-gray-100 rounded mx-auto" />
        </div>

        {/* フォームカード */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i}>
              <div className="h-4 w-24 bg-gray-200 rounded mb-1.5" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          ))}
          <div className="h-10 bg-gray-200 rounded-lg mt-2" />
        </div>
      </div>
    </div>
  )
}
