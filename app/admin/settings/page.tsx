import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { logoutAction } from '@/app/actions/auth'
import WaitMinutesForm from './_components/WaitMinutesForm'
import StoreProfileForm from './_components/StoreProfileForm'
import QRCode from './_components/QRCode'
import StoreImageUpload from './_components/StoreImageUpload'
import AdminNav from '../_components/AdminNav'

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
    .select('name, slug, description, area, cuisine_type, is_open, wait_minutes, stripe_account_id, logo_url, cover_url')
    .eq('id', session.storeId)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const storeUrl = store?.slug ? `${appUrl}/${store.slug}` : null

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="settings" role={session.role as 'owner' | 'staff'} title="店舗設定" />

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {welcome && !store?.stripe_account_id && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
            <div>
              <p className="font-bold text-amber-900"><span aria-hidden="true">🎉</span> 店舗登録が完了しました！</p>
              <p className="text-sm text-amber-800 mt-1">
                次のステップ：Stripe に接続してカード決済を有効にしましょう。接続しないと注文を受け付けられません。
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API routeへの遷移のため<a>が正しい */}
            <a
              href="/api/onboarding/stripe/connect"
              className="inline-flex items-center gap-2 bg-[#635bff] hover:bg-[#4f46e5] text-white text-sm font-bold rounded-lg px-5 py-2.5 transition-colors"
            >
              今すぐ Stripe に接続する<span aria-hidden="true"> →</span>
            </a>
          </div>
        )}

        {stripe_connected && (
          <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            Stripe との連携が完了しました。これでカード決済が有効になりました。
          </div>
        )}
        {stripe_error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Stripe 連携に失敗しました（{stripe_error}）。再試行してください。
          </div>
        )}

        {isOwner && (
          <StoreProfileForm
            name={store?.name ?? ''}
            slug={store?.slug ?? null}
            description={store?.description ?? null}
            area={store?.area ?? null}
            cuisineType={store?.cuisine_type ?? null}
          />
        )}

        <WaitMinutesForm defaultWaitMinutes={store?.wait_minutes ?? 20} />

        {/* 店舗画像（owner のみ） */}
        {isOwner && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
            <p className="font-semibold text-gray-900">店舗画像</p>
            <StoreImageUpload
              type="logo"
              currentUrl={store?.logo_url ?? null}
              label="ロゴ画像"
              hint="正方形推奨。JPEG / PNG / WebP（最大 5MB）"
              aspectClass="aspect-square"
            />
            <StoreImageUpload
              type="cover"
              currentUrl={store?.cover_url ?? null}
              label="カバー画像"
              hint="横長（1200×630px 推奨）。SNS シェア時に表示されます。JPEG / PNG / WebP（最大 5MB）"
              aspectClass="aspect-video"
            />
          </div>
        )}

        {/* QR コード（全スタッフ閲覧可） */}
        {storeUrl ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div>
              <p className="font-semibold text-gray-900">Stripe 決済連携</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {store?.stripe_account_id
                  ? `接続済み（${store.stripe_account_id}）`
                  : 'まだ Stripe に接続されていません。接続するとカード決済が有効になります。'}
              </p>
            </div>
            {!store?.stripe_account_id && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <span aria-hidden="true">⚠️</span> Stripe 未接続のため、現在は決済を受け付けられません
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API routeへの遷移のため<a>が正しい */}
            <a
              href="/api/onboarding/stripe/connect"
              className="inline-flex items-center gap-2 bg-[#635bff] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {store?.stripe_account_id ? 'Stripe を再接続' : <>Stripe に接続する<span aria-hidden="true"> →</span></>}
            </a>
          </div>
        )}

        {/* ── ログアウト */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">アカウント</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-red-600 hover:text-red-700 font-medium px-4 py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              ログアウト
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
