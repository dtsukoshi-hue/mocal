import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development'

// Supabase ホスト名（CSP の connect-src / img-src に必要）
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : ''

// Content Security Policy
// NOTE: nonce ベース CSP には proxy.ts（Next.js 16 の middleware）が必要になるため、
//       静的ページとの互換性を保ちつつ 'unsafe-inline' を許容するシンプル CSP を採用。
//       主な効果: connect-src・frame-src・img-src・object-src の制限による
//       データ漏洩・クリックジャッキング・プラグイン経由攻撃の防止。
const csp = [
  `default-src 'self'`,
  // unsafe-inline: React hydration・Next.js ランタイムの inline script が必要
  // unsafe-eval: 開発環境の React DevTools のみ（本番不要）
  `script-src 'self' 'unsafe-inline' https://js.stripe.com${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  // connect-src: Supabase API/Realtime と Stripe API のみを許可
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''} https://api.stripe.com https://r.stripe.com https://m.stripe.com`,
  // frame-src: Stripe Elements の iframe のみを許可
  `frame-src https://js.stripe.com https://hooks.stripe.com`,
  // img-src: 自ドメイン・Supabase Storage・data/blob URI
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ''}`,
  `font-src 'self'`,
  `media-src 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

// Supabase Storage の画像を next/image で最適化するためにドメインを許可
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname }]
      : [],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
