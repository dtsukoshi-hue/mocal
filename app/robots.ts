import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 管理画面・API・個人情報を含むページはクロール禁止
        disallow: [
          '/admin/',
          '/api/',
          '/onboarding/',
          '/orders/',
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  }
}
