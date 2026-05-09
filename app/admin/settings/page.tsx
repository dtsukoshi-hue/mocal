import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import Link from 'next/link'
import StoreOpenToggle from './_components/StoreOpenToggle'
import WaitMinutesForm from './_components/WaitMinutesForm'
import StoreProfileForm from './_components/StoreProfileForm'
import QRCode from './_components/QRCode'

export const metadata: Metadata = { title: '店舗設定 | mocal' }

interface Props {
  searchParams: Promise<{ stripe_connected?: string; stripe_error?: string; welcome?: string }>
}

export default async function SettingsPage({ searchParams }: Props) {
  const session = await verifyStoreSession()
  const isOwner = session.role === 'owner'
  const supabase = await createSupabaseServerClient()
  const { stripe_connected, stripe_error, welcome } = await searchParams

  const { data: store } = await supabase
    .from('stores')
    .select('name, slug, description, is_open, wait_minutes, stripe_account_id')
    .eq('id', session.storeId)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const storeUrl = store?.slug ? `${appUrl}/${store.slug}` : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
            ← 注文管理
          </Link>
          <h1 className="text-lg font-bold text-gray-900">店舗設定</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {welcome && !store?.stripe_account_id && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
            <div>
              <p className="font-bold text-orange-900">🎉 店舗登録が完了しました！</p>
              <p className="text-sm text-orange-800 mt-1">
                次のステップ：Stripe に接続してカード決済を有効にしましょう。接続しないと注文を受け付けられません。
              </p>
            </div>
            <a
              href="/api/onboarding/stripe/connect"
              className="inline-flex items-center gap-2 bg-[#635bff] hover:bg-[#4f46e5] text-white text-sm font-bold rounded-lg px-5 py-2.5 transition-colors"
            >
              今すぐ Stripe に接続する →
            </a>
          </div>
        )}

        {stripe_connected && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            Stripe との連携が完了しました。これでカード決済が有効になりました。
          </div>
        )}
        {stripe_error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Stripe 連携に失敗しました（{stripe_error}）。再試行してください。
          </div>
        )}

        <StoreOpenToggle isOpen={store?.is_open ?? false} />

        {isOwner && <StoreProfileForm name={store?.name ?? ''} slug={store?.slug ?? null} description={store?.description ?? null} />}

        <WaitMinutesForm defaultWaitMinutes={store?.wait_minutes ?? 20} />

        {/* QR コード（全スタッフ閲覧可） */}
        {storeUrl ? (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <p className="font-semibold text-gray-900">注文用 QR コード</p>
            <p className="text-sm text-gray-500">
              店頭に掲示することでお客様がスキャンして注文できます。
            </p>
            <QRCode url={storeUrl} storeName={store?.name ?? 'store'} />
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            QR コードを表示するには、まず上の「店舗情報」でURLを設定してください。
          </div>
        )}

        {/* Stripe Connect（owner のみ） */}
        {isOwner && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <div>
              <p className="font-semibold text-gray-900">Stripe 決済連携</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {store?.stripe_account_id
                  ? `接続済み（${store.stripe_account_id}）`
                  : 'まだ Stripe に接続されていません。接続するとカード決済が有効になります。'}
              </p>
            </div>
            {!store?.stripe_account_id && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                ⚠️ Stripe 未接続のため、現在は決済を受け付けられません
              </div>
            )}
            <a
              href="/api/onboarding/stripe/connect"
              className="inline-flex items-center gap-2 bg-[#635bff] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {store?.stripe_account_id ? 'Stripe を再接続' : 'Stripe に接続する →'}
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
