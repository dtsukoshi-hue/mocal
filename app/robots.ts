import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

  // Pilot 開始前は全 path クロール禁止 (Google 検索結果露出防止)
  // Pilot 開始時に従来の allow: '/' + 管理系 disallow に戻す (backlog 参照)
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
    // sitemap.xml は noindex 期間中も公開 (search console での状況把握用)
    sitemap: `${appUrl}/sitemap.xml`,
  }
}
