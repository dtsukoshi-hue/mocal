/**
 * OGP 画像生成用の日本語フォントローダー
 * Google Fonts から Noto Sans JP Bold を取得し ArrayBuffer で返す。
 * 失敗時は null を返す（ImageResponse がシステムフォントで代替）。
 */
export async function loadNotoSansJPBold(): Promise<ArrayBuffer | null> {
  try {
    // CSS API でビルドバリアントの woff2 URL を取得
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap',
      {
        headers: {
          // woff2 形式を返してもらうために Chrome の UA を指定
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        // Next.js のデータキャッシュで 24 時間キャッシュ
        next: { revalidate: 86400 },
      },
    ).then((r) => r.text())

    const woff2Url = css.match(/url\(([^)]+)\)/)?.[1]
    if (!woff2Url) return null

    return fetch(woff2Url, {
      next: { revalidate: 86400 },
    }).then((r) => r.arrayBuffer())
  } catch {
    return null
  }
}
