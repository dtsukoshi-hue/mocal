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
  if (url) {
    event.waitUntil(clients.openWindow(url))
  }
})
