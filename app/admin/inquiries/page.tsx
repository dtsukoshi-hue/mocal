import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { verifyStoreSession } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase-server'
import AdminNav from '../_components/AdminNav'

export const metadata: Metadata = { title: 'お問い合わせ | mocal' }
export const dynamic = 'force-dynamic'

export default async function InquiriesPage() {
  const session = await verifyStoreSession()
  if (session.role !== 'owner') redirect('/admin/dashboard')

  // store_inquiries は service_role のみアクセス可 (migration で RLS 有効・ポリシー無し)
  const supabase = createServiceClient()
  const { data: inquiries } = await supabase
    .from('store_inquiries')
    .select('id, name, store_name, email, message, created_at')
    .order('created_at', { ascending: false })

  const rows = inquiries ?? []

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav
        active="settings"
        role={session.role as 'owner' | 'staff'}
        title="お問い合わせ"
        backLabel="← 設定"
        backHref="/admin/settings"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            店舗導入お問い合わせ
            <span className="ml-2 text-sm font-normal text-gray-500">{rows.length} 件</span>
          </h2>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center text-sm text-gray-400">
            まだ問い合わせはありません
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <article key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{row.store_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{row.name}</p>
                  </div>
                  <time className="text-xs text-gray-400 shrink-0 tabular-nums">
                    {new Date(row.created_at).toLocaleString('ja-JP', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'Asia/Tokyo',
                    })}
                  </time>
                </div>
                <a
                  href={`mailto:${row.email}`}
                  className="inline-block text-xs text-amber-700 hover:text-amber-800 underline"
                >
                  {row.email}
                </a>
                {row.message && (
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-xl px-4 py-3">
                    {row.message}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
