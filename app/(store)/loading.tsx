// 顧客側ページ遷移時のローディング表示
export default function StoreLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-gray-100 h-16" />
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
