import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import MenuView from './_components/MenuView'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()
  const { data: store } = await supabase
    .from('stores')
    .select('name, description')
    .eq('slug', slug)
    .single()

  if (!store) return { title: '店舗が見つかりません | mocal' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const title = `${store.name} | mocal`
  const description = store.description
    ?? `${store.name}のテイクアウトをオンラインで事前注文。待ち時間なしでスムーズに受け取れます。`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/${slug}`,
      siteName: 'mocal',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()

  const { data: store } = await supabase
    .from('stores')
    .select('id, name, description, is_open, wait_minutes')
    .eq('slug', slug)
    .single()

  if (!store) notFound()

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, description, price, category, emoji, is_available, sort_order')
    .eq('store_id', store.id)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <MenuView store={store} menuItems={menuItems ?? []} />
  )
}
