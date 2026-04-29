'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  href: string
  label: string
  icon: string
}

interface Props {
  /** 「ホーム」タブのリンク先（店舗ページ）。指定があればホームを表示 */
  homeHref?: string
}

export default function CustomerBottomNav({ homeHref }: Props) {
  const pathname = usePathname()

  const tabs: Tab[] = []
  if (homeHref) tabs.push({ href: homeHref, label: 'ホーム', icon: '🏠' })
  tabs.push({ href: '/orders', label: '注文履歴', icon: '📋' })
  tabs.push({ href: '/mypage', label: 'マイページ', icon: '👤' })

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 print:hidden">
      <div className="max-w-lg mx-auto grid grid-cols-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/' && pathname?.startsWith(tab.href))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? 'text-amber-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
