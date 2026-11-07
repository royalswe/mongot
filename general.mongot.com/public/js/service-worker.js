self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Someone arrived in the Lobby', {
    icon: '/img/users-icon.png',
    tag: 'general-lobby'
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil((async function () {
    const lobbyUrl = new URL('/lobby', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === lobbyUrl) {
        return client.focus();
      }
    }
    return self.clients.openWindow(lobbyUrl);
  }()));
});
