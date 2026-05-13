import Link from 'next/link'

interface Props {
  active: 'orders' | 'menu' | 'hours' | 'reports' | 'history' | 'settings' | 'staff'
  role: 'owner' | 'staff'
  rightSlot?: React.ReactNode
  /** 戻るリンクを表示する場合のテキスト（例: "← 注文管理"）*/
  backLabel?: string
  backHref?: string
  title?: string
}

const TABS: { key: Props['active']; label: string; href: string }[] = [
  { key: 'orders',   label: '注文管理',   href: '/admin/dashboard' },
  { key: 'menu',     label: 'メニュー',   href: '/admin/menu' },
  { key: 'hours',    label: '営業時間',   href: '/admin/hours' },
  { key: 'reports',  label: 'レポート',   href: '/admin/sales' },
  { key: 'history',  label: '履歴',       href: '/admin/history' },
]

export default function AdminNav({ active, role, rightSlot, backLabel, backHref, title }: Props) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
      <div className="max-w-5xl mx-auto px-4">
        {/* ロゴ行 + 戻るリンク + rightSlot */}
        <div className="py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {backLabel && backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3L5 8l5 5" />
                </svg>
                {backLabel}
              </Link>
            ) : (
              <span className="text-base font-black tracking-tight text-gray-900 shrink-0">
                <span className="text-amber-600">m</span>ocal
                <span className="text-gray-400 font-normal text-sm ml-1.5">店舗管理</span>
              </span>
            )}
            {title && <h1 className="text-base font-bold text-gray-900 shrink-0">{title}</h1>}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {rightSlot}
          </div>
        </div>

        {/* タブナビ — overflow-x-auto でモバイルでもスクロール可能 */}
        <nav
          className="flex items-center gap-0.5 overflow-x-auto pb-px scrollbar-none -mx-4 px-4"
          aria-label="管理メニュー"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`text-sm px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px ${
                t.key === active
                  ? 'text-amber-700 font-semibold border-amber-600 bg-amber-50/60'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent'
              }`}
            >
              {t.label}
            </Link>
          ))}
          {role === 'owner' && (
            <Link
              href="/admin/staff"
              className={`text-sm px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px ${
                active === 'staff'
                  ? 'text-amber-700 font-semibold border-amber-600 bg-amber-50/60'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent'
              }`}
            >
              スタッフ
            </Link>
          )}
          <Link
            href="/admin/settings"
            className={`text-sm px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px ${
              active === 'settings'
                ? 'text-amber-700 font-semibold border-amber-600 bg-amber-50/60'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent'
            }`}
          >
            設定
          </Link>
        </nav>
      </div>
    </header>
  )
}
