// Service worker : met l'interface en cache pour un démarrage rapide et un affichage hors ligne.
// Stratégie « réseau d'abord » : les mises à jour sont visibles immédiatement quand on est en ligne.
const CACHE = 'auphine-v1';
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
  '/js/state.js',
  '/js/ui.js',
  '/js/views/auth.js',
  '/js/views/goal-form.js',
  '/js/views/partner.js',
  '/js/views/profile.js',
  '/js/views/skills.js',
  '/js/views/today.js',
  '/js/views/week.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
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
