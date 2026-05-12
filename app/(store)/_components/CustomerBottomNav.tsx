'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  /** 「ホーム」タブのリンク先（店舗ページ）。指定があればホームを表示 */
  homeHref?: string
}

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconOrders({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  )
}

function IconPerson({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export default function CustomerBottomNav({ homeHref }: Props) {
  const pathname = usePathname()

  const homeActive = pathname === (homeHref ?? '/')
  const ordersActive = pathname?.startsWith('/orders') ?? false
  const mypageActive = pathname?.startsWith('/mypage') ?? false

  const tabs = [
    { href: homeHref ?? '/', label: 'ホーム',   active: homeActive,   Icon: IconHome },
    { href: '/orders',        label: '注文履歴', active: ordersActive, Icon: IconOrders },
    { href: '/mypage',        label: 'マイページ', active: mypageActive, Icon: IconPerson },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 print:hidden safe-area-bottom">
      <div className="max-w-lg mx-auto grid grid-cols-3">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${
              tab.active ? 'text-amber-700' : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-current={tab.active ? 'page' : undefined}
          >
            <tab.Icon active={tab.active} />
            <span className={`text-[10px] font-semibold ${tab.active ? 'text-amber-700' : 'text-gray-400'}`}>
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
