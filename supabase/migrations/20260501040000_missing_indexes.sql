-- ============================================================
-- 欠落インデックスの追加
-- ============================================================

-- order_items.order_id: ダッシュボード・注文詳細取得で頻繁に結合される
create index if not exists idx_order_items_order_id
  on order_items (order_id);

-- push_subscriptions.store_id: 店舗へのプッシュ通知送信時に使用
create index if not exists idx_push_subscriptions_store_id
  on push_subscriptions (store_id);

-- processed_webhook_events.processed_at: 古いイベントのクリーンアップ時に使用
create index if not exists idx_processed_webhook_events_processed_at
  on processed_webhook_events (processed_at);
