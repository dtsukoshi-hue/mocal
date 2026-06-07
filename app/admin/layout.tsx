import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// /admin/* 全 page を dynamic rendering 化する。
// 目的: proxy.ts が毎リクエスト生成する CSP nonce を、Next.js が script tag に
// auto-inject するためには dynamic rendering が必須 (公式ガイド
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
// L181, L391 参照)。
//
// Next 16 では `'use client'` page に `export const dynamic = 'force-dynamic'`
// を書いても prerender 判定に影響しないため、reset-password / login が
// prerender されて nonce 不在 → CSP block → hydration 失敗していた
// (2026-06-08 実機 audit で発覚)。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
