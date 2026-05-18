/**
 * Kariuki Textiles POS — Service Worker
 * Version: KariukiPOS-v2.5
 *
 * DEPLOY: Place this file in the SAME folder as kariuki-textiles-pos-pwa.html
 * and serve both from an HTTP/HTTPS server (localhost works fine).
 *
 * The page auto-detects this file via a HEAD request on load and
 * registers it automatically — no code changes needed.
 */

const VERSION = 'KariukiPOS-v2.5';
const CACHE   = VERSION + '-static';
const RUNTIME = VERSION + '-runtime';

/* ── Assets to pre-cache on install ── */
const PRECACHE_ASSETS = [
  './',
  './kariuki-textiles-pos-pwa.html',
];

/* ════════════════════════════════════
   INSTALL — cache shell on first load
════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => {
        // addAll fails if any resource 404s — catch gracefully
        console.warn('[KariukiPOS SW] Pre-cache partial failure:', err);
        return self.skipWaiting();
      })
  );
});

/* ════════════════════════════════════
   ACTIVATE — clean up old caches
════════════════════════════════════ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== RUNTIME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ════════════════════════════════════
   FETCH — stale-while-revalidate
════════════════════════════════════ */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* Skip cross-origin requests (fonts, CDN icons, charts) */
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      /* Always try the network in the background */
      const networkFetch = fetch(event.request)
        .then(response => {
          if (
            response &&
            response.status === 200 &&
            response.type === 'basic'
          ) {
            const clone = response.clone();
            caches.open(RUNTIME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      /* Return cached immediately if available, otherwise wait for network */
      return cached || networkFetch || new Response(
        'You are offline. Kariuki POS is available in offline mode.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } }
      );
    })
  );
});

/* ════════════════════════════════════
   MESSAGE — skip waiting on update
════════════════════════════════════ */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ════════════════════════════════════
   BACKGROUND SYNC — flush offline sales
════════════════════════════════════ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-sales') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(clients => {
          clients.forEach(client =>
            client.postMessage({ type: 'SYNC_COMPLETE' })
          );
        })
    );
  }
});

/* ════════════════════════════════════
   PUSH NOTIFICATIONS
════════════════════════════════════ */
self.addEventListener('push', event => {
  let data = { title: 'Kariuki POS', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Kariuki POS', {
      body:    data.body   || '',
      icon:    data.icon   || 'icon-192.png',
      badge:   data.badge  || 'icon-96.png',
      tag:     data.tag    || 'kariuki-pos',
      vibrate: [200, 100, 200],
      data:    data.url ? { url: data.url } : undefined,
    })
  );
});

/* ════════════════════════════════════
   NOTIFICATION CLICK — focus or open
════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const existing = clients.find(c => c.url === targetUrl && 'focus' in c);
        if (existing) return existing.focus();
        return self.clients.openWindow(targetUrl);
      })
  );
});
