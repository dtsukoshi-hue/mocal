// /admin/* 配下のページ遷移時のローディング表示
export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-gray-200 h-14" />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
        <div className="h-32 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
