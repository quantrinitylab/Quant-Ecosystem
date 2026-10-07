// ============================================================================
// QuantChat - Service Worker (Task 10.1)
//
// Handles Web Push API delivery and notification interaction:
//   - `push`             -> parse payload, showNotification (Req 9.1, 9.2, 9.3)
//   - `notificationclick`-> focus/open the app and deep-link to content (Req 9.7)
//
// The deep-link resolution here MIRRORS src/lib/notification-deeplink.ts so the
// service-worker (which cannot import app TS modules) navigates to the same
// routes as the in-app handler.
// ============================================================================

self.addEventListener('install', (event) => {
  // Activate the new worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all open clients as soon as the worker activates.
  event.waitUntil(self.clients.claim());
});

// Map a notification category + content id to an in-app route.
// Mirror of resolveDeepLink() in src/lib/notification-deeplink.ts.
function resolveDeepLink(category, contentId) {
  switch (String(category || '').toUpperCase()) {
    case 'MESSAGES':
      return contentId ? '/chat/' + contentId : '/chat';
    case 'CALLS':
      return '/call';
    case 'STORIES':
      return contentId ? '/stories/' + contentId : '/stories';
    case 'REELS':
      return contentId ? '/reels/' + contentId : '/reels';
    case 'STREAKS':
      return contentId ? '/chat/' + contentId : '/chat';
    case 'SYSTEM':
    default:
      return '/notifications';
  }
}

self.addEventListener('push', (event) => {
  // Payloads are JSON: { title, body, category, contentId, deepLink, tag, ... }
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'QuantChat', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'QuantChat';
  const category = data.category || 'SYSTEM';
  const contentId = data.contentId || data.deepLinkId || '';
  const deepLink = data.deepLink || resolveDeepLink(category, contentId);

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    // High-priority (e.g. calls) use a stable tag so repeated rings collapse.
    tag: data.tag || category,
    // Calls should re-alert; batched/non-urgent should be quiet.
    renotify: Boolean(data.renotify),
    requireInteraction: category === 'CALLS' || data.requireInteraction === true,
    silent: data.silent === true,
    data: {
      category: category,
      contentId: contentId,
      deepLink: deepLink,
      ...(data.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const payload = event.notification.data || {};
  const targetPath = payload.deepLink || resolveDeepLink(payload.category, payload.contentId);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If an app window is already open, focus it and tell it to navigate.
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', deepLink: targetPath });
          return client.focus();
        }
      }
      // Otherwise open a fresh window at the deep-linked route.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
      return undefined;
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated/expired the subscription. Best-effort re-subscribe using
  // the previous applicationServerKey; the client also re-checks on next visit
  // (Task 10.6 / Req 9.8).
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          event.oldSubscription && event.oldSubscription.options
            ? event.oldSubscription.options.applicationServerKey
            : undefined,
      })
      .then((subscription) =>
        fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        }).catch(() => undefined),
      )
      .catch(() => undefined),
  );
});
