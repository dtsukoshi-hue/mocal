import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'よくある質問 | mocal',
  description: 'mocal テイクアウト事前注文サービスに関するよくある質問と回答',
}

interface QA {
  q: string
  a: string | ReactNode
}

const sections: { title: string; items: QA[] }[] = [
  {
    title: '注文について',
    items: [
      {
        q: '注文はどうすれば完了しますか？',
        a: '店舗ページでメニューをカートに追加し、クレジットカードで決済すると注文完了です。決済が確認され次第、店舗に通知が届きます。',
      },
      {
        q: 'どの支払い方法が使えますか？',
        a: 'Visa・Mastercard・American Express・JCB などの主要クレジットカードに対応しています。決済は Stripe が安全に処理します。',
      },
      {
        q: '事前予約（日時指定）はできますか？',
        a: 'はい。カート画面で「日時指定」を選択すると、受取時刻を指定できます。店舗の営業時間内で選択してください。',
      },
      {
        q: '注文内容を変更できますか？',
        a: '注文が確定（決済済み）した後は内容変更できません。必要な場合は注文をキャンセルして再注文してください。キャンセルは注文確定直後（店舗受付前）のみ可能です。',
      },
    ],
  },
  {
    title: 'キャンセル・返金',
    items: [
      {
        q: '注文をキャンセルできますか？',
        a: '店舗が受付する前（ステータスが「注文受付済」の間）は、注文詳細ページからキャンセルできます。キャンセル後は自動的に返金処理が行われます。',
      },
      {
        q: '返金はいつ反映されますか？',
        a: '返金は通常 5〜10 営業日以内にカード会社へ返戻されます。実際の口座への反映はカード会社の処理によって異なります。',
      },
      {
        q: '受け取りに行けなかった場合はどうなりますか？',
        a: '準備完了から一定時間が経過すると「未受取」のステータスに変わります。代金の返金は行われません。ご都合が合わない場合は早めにキャンセルしてください。',
      },
    ],
  },
  {
    title: '受取・通知',
    items: [
      {
        q: '注文の準備ができたらどうやって分かりますか？',
        a: 'プッシュ通知を許可している場合、準備完了時にスマートフォンへ通知が届きます。ブラウザの通知を許可してご利用ください。',
      },
      {
        q: 'プッシュ通知の設定方法は？',
        a: '注文後の画面または注文詳細ページに「通知を許可する」ボタンが表示されます。タップしてブラウザの通知を許可すると、準備完了時に通知が届きます。',
      },
      {
        q: '受け取りの際に何が必要ですか？',
        a: '注文時に発行される受取番号（注文番号）を店員にお伝えください。注文詳細ページに表示されています。',
      },
    ],
  },
  {
    title: '注文履歴・その他',
    items: [
      {
        q: '過去の注文を確認できますか？',
        a: '「注文履歴」ページから確認できます。注文履歴はこのブラウザ（端末）に保存されるため、別の端末やブラウザからは参照できません。',
      },
      {
        q: '領収書は発行できますか？',
        a: '注文詳細ページの「受取完了」後に領収書を確認できます。「領収書を表示」からブラウザの印刷機能を使って PDF として保存することも可能です。',
      },
      {
        q: 'mocal に掲載されたいのですが？',
        a: (
          <>
            <Link href="/for-stores" className="text-amber-700 hover:underline">店舗様向けページ</Link>
            からお問い合わせください。初期費用・月額固定費は無料です。
          </>
        ),
      },
    ],
  },
]

export default function FaqPage() {
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
          <h1 className="text-base font-bold text-gray-900">よくある質問</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 mb-3">
              {section.title}
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {section.items.map(item => (
                <details key={item.q} className="group">
                  <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                    <span className="text-sm font-semibold text-gray-900 leading-snug">{item.q}</span>
                    <svg
                      className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180"
                      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 pt-1 text-sm text-gray-600 leading-relaxed">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <nav className="text-center text-xs text-gray-400 space-x-3 pb-8">
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
