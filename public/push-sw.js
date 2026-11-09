/* Avisos do Confin. Importado pelo service worker gerado pelo vite-plugin-pwa (workbox.importScripts). */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const scope = self.registration.scope;
  // Só abre telas do próprio app.
  const url = typeof data.url === 'string' && data.url.startsWith(scope) ? data.url : scope;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Confin', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: new URL('icon.svg', scope).href,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const url = (event.notification.data && event.notification.data.url) || scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(scope)) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
