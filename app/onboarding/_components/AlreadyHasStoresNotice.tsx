'use client'

interface Store {
  name: string
  slug: string
  role: string
}

interface Props {
  stores: Store[]
}

export default function AlreadyHasStoresNotice({ stores }: Props) {
  if (stores.length === 0) return null

  return (
    <div className="bg-blue-50 border-b border-blue-100 px-4 py-3">
      <div className="max-w-md mx-auto">
        <p className="text-xs text-blue-900 font-semibold mb-1">
          ログイン中のアカウントに既存店舗があります
        </p>
        <ul className="space-y-0.5">
          {stores.map(s => (
            <li key={s.slug || s.name} className="text-xs text-blue-800">
              ・ <strong>{s.name}</strong>
              {s.slug && <span className="text-blue-600"> (mocal.jp/{s.slug})</span>}
              <span className="text-blue-600 ml-1">[{s.role}]</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-blue-700 mt-2">
          下のフォームで <strong>新しい店舗を追加</strong>できます。
        </p>
      </div>
    </div>
  )
}
