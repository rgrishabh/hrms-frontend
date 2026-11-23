/*
 * App-shell service worker. Caches static code only: the HTML shell and hashed assets. It never touches
 * /api, /brand or runtime config, so no L3/L4 response or personal data can reach disk through it.
 * The cache name and asset list are filled in by the build (see vite.config.ts).
 */
const CACHE = 'hrms-shell-__BUILD__';
const PRECACHE = __PRECACHE__;
const NEVER = /^\/(api|brand|branding|health|ready|healthz|env\.js)(\/|$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hrms-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || NEVER.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    // Fresh shell when online, cached shell when not. The app then shows its own offline state.
    event.respondWith(fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed names never change, so a cached copy is always right. Feature chunks are added as they are used.
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    })));
    return;
  }

  if (PRECACHE.includes(url.pathname)) event.respondWith(fetch(request).catch(() => caches.match(request)));
});

/* The push payload is ignored and nothing is stored: the message is generic and details stay in the app. */
self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('You have a new notification', { body: 'Open the app to see it.', icon: '/icon.svg', tag: 'hrms' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const open = list[0];
    return open ? open.focus().then((c) => c.navigate('/notifications')) : self.clients.openWindow('/notifications');
  }));
});
