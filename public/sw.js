self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch (_) {}
  const title = data.title ?? 'mocal'
  const options = {
    body: data.body ?? '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.url ? { url: data.url } : undefined,
    requireInteraction: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url
  if (!url) return
  // 既に同じ URL を開いているタブがあればそちらをフォーカスする
  // なければ新しいウィンドウで開く
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
