import LegalLayout from '../legal/_components/LegalLayout'

export const metadata = {
  title: '特定商取引法に基づく表記',
}

// 特定商取引法に基づく表記
// 会社情報は CLAUDE.md の設立準備中表記に従う。確定後に更新が必要。
// 注意: 本ページは「mocal プラットフォーム自体」の表記。
// 各加盟店の商取引情報（販売事業者等）は別途店舗ごとに表示する設計が必要。

export default function TokushohoPage() {
  return (
    <LegalLayout title="特定商取引法に基づく表記" lastUpdated="2026年5月1日">
      <Row label="販売事業者">
        Entrust 合同会社（設立準備中）
        <br />
        <small className="text-gray-400">※ 法人設立後に正式社名を更新します。</small>
      </Row>
      <Row label="運営責任者">津越 大輔</Row>
      <Row label="所在地">設立後に更新</Row>
      <Row label="お問い合わせ先">
        support@mocal.jp（予定）
        <br />
        <small className="text-gray-400">
          ※ 上記メールアドレスは法人設立後に開設します。それまでは GitHub Issues 等を通じてご連絡ください。
        </small>
      </Row>
      <Row label="サービス名称">mocal（モカル）</Row>
      <Row label="販売価格">
        各メニューページに税込価格で表示しています（消費税 10%）。
      </Row>
      <Row label="商品代金以外の必要料金">
        サービス利用手数料：無料（ユーザー手数料 ¥0）
        <br />
        通信費はお客様のご負担となります。
      </Row>
      <Row label="お支払い方法">
        クレジットカード（Visa / Mastercard / JCB / Amex）<br />
        Apple Pay / Google Pay
      </Row>
      <Row label="お支払い時期">
        ご注文確定時に決済が確定します。決済処理は Stripe 社により行われます。
      </Row>
      <Row label="商品の引渡時期">
        各注文ページに表示される受取目安時間に従ってください。
        受取場所は加盟店店舗となります。
      </Row>
      <Row label="返品・キャンセルについて">
        食品の特性上、原則として注文確定後のキャンセルはお受けしておりません。
        ただし以下の場合は店舗または mocal の判断で全額返金いたします:
        <ul>
          <li>店舗都合により提供不能となった場合</li>
          <li>店舗が指定した受取時間を大幅に過ぎてもご準備できなかった場合</li>
          <li>商品に明らかな不備があった場合</li>
        </ul>
        返金処理は Stripe 経由で自動的に行われ、お支払いに利用された決済手段に返金されます。
      </Row>
      <Row label="動作環境">
        最新版の Chrome / Safari / Firefox / Edge でご利用いただけます。
        プッシュ通知機能は対応ブラウザでのみご利用可能です。
      </Row>
    </LegalLayout>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="not-prose mb-4 grid grid-cols-1 md:grid-cols-4 gap-1 md:gap-3 py-3 border-b border-gray-100">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider md:col-span-1">{label}</h3>
      <div className="text-sm text-gray-800 md:col-span-3 leading-relaxed">{children}</div>
    </section>
  )
}
