// Service worker : cache de l'interface (démarrage rapide, affichage hors ligne) et notifications push.
// Stratégie « réseau d'abord » : les mises à jour sont visibles immédiatement quand on est en ligne.
const CACHE = 'auphine-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/theme.js',
  '/js/app.js',
  '/js/api.js',
  '/js/components.js',
  '/js/dates.js',
  '/js/push.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/views/auth.js',
  '/js/views/goal-form.js',
  '/js/views/goal-sheet.js',
  '/js/views/partner.js',
  '/js/views/profile.js',
  '/js/views/progress.js',
  '/js/views/today.js',
  '/js/views/week.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Les données (API) ne sont jamais mises en cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))),
  );
});

// --- Notifications push -------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Auphine', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      client.postMessage({ type: 'navigate', hash: target.hash || '#/today' });
      return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
