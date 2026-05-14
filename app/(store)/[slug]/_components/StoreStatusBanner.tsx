// 受付状態バッジ（MenuView が Realtime で管理する isOpen/waitMinutes を受け取る）
interface Props {
  isOpen: boolean
  waitMinutes: number
}

export default function StoreStatusBanner({ isOpen, waitMinutes }: Props) {
  return (
    <div className="flex items-center gap-2 mt-1" aria-live="polite" aria-atomic="true">
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
          isOpen
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        {isOpen ? '受付中' : '受付停止中'}
      </span>
      {isOpen && waitMinutes > 0 && (
        <span className="text-xs text-gray-500">
          約{waitMinutes}分
        </span>
      )}
    </div>
  )
}
