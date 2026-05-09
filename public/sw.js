const CACHE_NAME = 'mocal-v1'
const STATIC_ASSETS = [
  '/api/icons/192',
  '/api/icons/512',
]

// インストール時に静的アセットをプリキャッシュ
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// 古いキャッシュを削除
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    })
  )
  self.clients.claim()
})

// フェッチ: アイコンは Cache First、それ以外は Network First
self.addEventListener('fetch', function (event) {
  const { request } = event
  const url = new URL(request.url)

  // アイコンは Cache First
  if (url.pathname.startsWith('/api/icons/')) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, clone)
          })
          return response
        })
      })
    )
    return
  }

  // その他はネットワーク優先（PWAとして最低限のオフライン対応のみ）
})

// プッシュ通知受信
self.addEventListener('push', function (event) {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body,
    icon: '/api/icons/192',
    badge: '/api/icons/192',
    vibrate: [100, 50, 100],
    // tag が指定されている場合は同種の通知をまとめる（例: 店舗への新規注文通知）
    // 指定がない場合はタイムスタンプでユニークにして積み上げる
    tag: data.tag || ('mocal-' + Date.now()),
    renotify: !!data.tag,
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// 通知クリック
self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const url = event.notification.data?.url || '/'
  const absoluteUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 既存タブが同じURLなら focus してそちらへ移動
      for (const client of clientList) {
        if (client.url === absoluteUrl && 'focus' in client) {
          return client.focus()
        }
      }
      // 一致するタブがなければ新しいウィンドウ/タブを開く
      // （既存タブを強制遷移させると作業中の画面を奪うため避ける）
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl)
      }
    })
  )
})
