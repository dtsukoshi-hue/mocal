import Link from 'next/link'

interface Props {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalLayout({ title, lastUpdated, children }: Props) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/mypage"
            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
            aria-label="マイページに戻る"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6">
        <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 prose prose-sm max-w-none text-gray-700">
          {children}
          <hr className="my-6 border-gray-200" />
          <p className="text-xs text-gray-400 text-right">最終更新日: {lastUpdated}</p>
        </article>

        <nav className="mt-6 text-center text-xs text-gray-400 space-x-3">
          <Link href="/tokushoho" className="hover:underline">特定商取引法</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:underline">プライバシーポリシー</Link>
          <span>·</span>
          <Link href="/terms" className="hover:underline">利用規約</Link>
        </nav>
      </main>
    </div>
  )
}
