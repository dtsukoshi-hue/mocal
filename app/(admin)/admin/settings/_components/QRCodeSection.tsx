import QRCode from 'qrcode'

interface Props {
  storeId: string
  storeName: string
}

export default async function QRCodeSection({ storeId, storeName }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal-iota.vercel.app'
  const storeUrl = `${appUrl}/${storeId}`

  // サーバーサイドで SVG を生成（外部サービス不要・オフラインでも動作）
  const svgString = await QRCode.toString(storeUrl, {
    type: 'svg',
    width: 256,
    margin: 2,
    color: { dark: '#1c1917', light: '#ffffff' }, // stone-900 / white
  })

  // SVG を Base64 Data URL に変換してブラウザで inline 表示・印刷可能にする
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">注文 QR コード</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          店頭に掲示してお客様に読み取ってもらうと注文ページが開きます
        </p>
      </div>
      <div className="px-5 py-5 flex flex-col items-center gap-4">
        {/* QR コード */}
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm print:shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={svgDataUrl}
            alt={`${storeName} 注文 QR コード`}
            width={200}
            height={200}
            className="block"
          />
        </div>

        {/* 店舗名・URL */}
        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-gray-900">{storeName}</p>
          <p className="text-xs text-gray-400 break-all max-w-xs">{storeUrl}</p>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-2 w-full max-w-xs">
          <a
            href={svgDataUrl}
            download={`${storeName}-qr.svg`}
            className="flex-1 text-center text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-lg transition-colors"
          >
            SVG ダウンロード
          </a>
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs font-semibold text-gray-600 border border-gray-200 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
          >
            注文ページを開く
          </a>
        </div>
      </div>
    </div>
  )
}
