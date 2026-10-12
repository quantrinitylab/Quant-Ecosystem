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
// QC-F-142: every target below is a route that actually exists. The old
// map sent CALLS/SYSTEM/unknown to a non-existent '/notifications',
// STORIES/REELS with an id to non-existent '/stories/<id>' / '/reels/<id>',
// and MESSAGES/STREAKS without an id to a non-existent '/chat' — all 404s.
// Parity with the TS copies is enforced by the shared test vectors in
// test-fixtures/notification-deeplink-vectors.json.
function resolveDeepLink(category, contentId) {
  const id = String(contentId || '').trim();
  switch (String(category || '').toUpperCase()) {
    case 'MESSAGES':
      return id ? '/chat/' + id : '/';
    case 'CALLS':
      // The real call-history page; it takes no call id in the URL.
      return '/calls';
    case 'STORIES':
      return '/stories';
    case 'REELS':
      return '/reels';
    case 'STREAKS':
      return id ? '/chat/' + id : '/';
    case 'SYSTEM':
    default:
      return '/';
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
  // QC-F-142 legacy alias (one release): payloads from before the contract
  // fix carried ONLY `conversationId` — treat one as a MESSAGES push for
  // that conversation instead of falling back to the SYSTEM home.
  const category = data.category || (data.conversationId ? 'MESSAGES' : 'SYSTEM');
  const contentId = data.contentId || data.deepLinkId || data.conversationId || '';
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
      // If an app window is already open, NAVIGATE it to the target and
      // focus it. QC-F-142: this used to only postMessage + focus — but no
      // client listener for NOTIFICATION_CLICK exists, so a tap on an
      // already-open app merely focused the stale screen and the
      // conversation never opened. The postMessage stays for any future
      // listener; navigate() is what actually moves the user. If navigate
      // is unavailable or fails, fall back to the old focus-only behaviour.
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', deepLink: targetPath });
          if ('navigate' in client) {
            return client
              .navigate(targetPath)
              .then((navigatedClient) =>
                navigatedClient && 'focus' in navigatedClient
                  ? navigatedClient.focus()
                  : client.focus(),
              )
              .catch(() => client.focus());
          }
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
