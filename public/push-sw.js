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
  const options = {
    body: data.body || '',
    icon: new URL('icon.svg', scope).href,
    vibrate: [200, 100, 200],
    data: { url },
  };
  // Um aviso novo com a mesma tag substitui o anterior; renotify faz ele tocar e vibrar de novo.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Confin', options));
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
