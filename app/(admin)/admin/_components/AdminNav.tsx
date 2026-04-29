import Link from 'next/link'
import { logoutAction } from '@/app/actions/auth'

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
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {backLabel && backHref ? (
            <Link
              href={backHref}
              className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              {backLabel}
            </Link>
          ) : (
            <span className="text-base font-bold text-gray-900 shrink-0">
              <span className="text-amber-600">m</span>ocal 店舗管理
            </span>
          )}
          {title && <h1 className="text-base font-bold text-gray-900 shrink-0">{title}</h1>}
          {rightSlot}
        </div>
        <nav className="flex items-center gap-0.5 shrink-0">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                t.key === active
                  ? 'text-gray-900 font-bold bg-gray-100'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
          {role === 'owner' && (
            <Link
              href="/admin/staff"
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                active === 'staff'
                  ? 'text-gray-900 font-bold bg-gray-100'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              スタッフ
            </Link>
          )}
          <Link
            href="/admin/settings"
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              active === 'settings'
                ? 'text-gray-900 font-bold bg-gray-100'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            設定
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              ログアウト
            </button>
          </form>
        </nav>
      </div>
    </header>
  )
}
