/* QuantMail service worker — Web Push delivery (QM-UIUX-053).
 *
 * This worker exists for exactly one job: receive a push the server sent
 * through the Web Push protocol and show it, then take the click to the
 * conversation it names. It deliberately has no fetch handler and no cache —
 * it must never change how the app itself loads.
 *
 * The payload is the JSON `WebPushService` serializes in
 * `@quant/notifications`: `{ title, body, tag, data: { url, ... } }`.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'QuantMail';
  const url = (payload.data && payload.data.url) || '/inbox';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/quanty-ghost.png',
      tag: payload.tag || undefined,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/inbox';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ('focus' in client) {
          try {
            await client.navigate(url);
          } catch {
            /* A client that refuses navigation still gets focused. */
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
