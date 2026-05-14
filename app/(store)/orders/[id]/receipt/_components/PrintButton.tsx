'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm bg-gray-900 text-white rounded-lg px-4 py-2 hover:bg-gray-700 transition-colors"
    >
      🖨️ 印刷する
    </button>
  )
}
