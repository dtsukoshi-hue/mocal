import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

// NOTE: Content-Security-Policy は proxy.ts（Next.js 16 の middleware）で
//       nonce ベースに動的生成している。ここには記載しない。

const securityHeaders = [
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

// Sentry の withSentryConfig は SENTRY_DSN 等が未設定でも build を通す。
// AUTH_TOKEN 未設定時は source map upload を skip し、warning のみで成功。
// したがって DSN 取得前 (pilot 前) の現状でも安全に wrap できる。
const finalConfig = withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload は SENTRY_AUTH_TOKEN がある時だけ。未設定なら自動で skip。
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // tunnel route で adblocker 回避 (将来 client 計測が増えたら活きる)
  tunnelRoute: '/monitoring/sentry',
  // 開発時のオーバーヘッドを抑制
  disableLogger: true,
  // bundle size を抑える: tree-shaking で未使用機能を排除
  widenClientFileUpload: false,
})

export default finalConfig;
