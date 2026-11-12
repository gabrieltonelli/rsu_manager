/* Service Worker para Notificaciones Web Push - RSU Manager */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'RSU Manager',
    body: 'Nueva notificación del sistema de gestión ambiental.',
    url: '/',
    tag: 'rsu-push',
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (err) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    tag: payload.tag || 'rsu-push',
    data: { url: payload.url || '/' },
    vibrate: [150, 80, 150],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

