// TaskLS Service Worker - Suporte para notificações nativas e gerenciamento de janelas

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Ação ao clicar na notificação nativa do sistema
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focar em uma aba aberta do TaskLS ou abrir nova aba
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
