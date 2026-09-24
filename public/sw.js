/* Atmosphere service worker.
   - Precaches the app shell so the dashboard loads offline.
   - Serves same-origin static assets cache-first with background fill.
   - Serves OpenWeatherMap API requests network-first, falling back to
     the last cached response when the network is unavailable.
   - Answers CLEAR_CACHES messages from the page (manual cache reset). */

const SHELL_CACHE = 'atmosphere-shell-v2';
const RUNTIME_CACHE = 'atmosphere-runtime-v1';
const DATA_CACHE = 'atmosphere-data-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/cache.js',
  '/data-source.js',
  '/demo-data.js',
  '/style.css',
  '/manifest.webmanifest',
  '/icon.svg',
];

const API_HOSTS = ['api.openweathermap.org', 'openweathermap.org'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Cache entries individually: dev serves /app.js & friends directly,
      // production bundles them into /assets/*, so never let one missing
      // URL sink the whole precache.
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !keep.includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      Promise.all([RUNTIME_CACHE, DATA_CACHE].map(name => caches.delete(name)))
        .then(() => event.source && event.source.postMessage({ type: 'CACHES_CLEARED' }))
    );
  }
});

function networkFirst(request, cacheName) {
  return fetch(request).then(response => {
    if (response && (response.ok || response.type === 'opaque')) {
      const copy = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => {
    if (cached) return cached;
    throw new Error('offline and no cached response');
  }));
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, copy));
    }
    return response;
  }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Weather API calls: fresh data when possible, cached response offline.
  if (API_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Page navigations: try the network, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first, populate from the network on miss.
  event.respondWith(
    cacheFirst(request, RUNTIME_CACHE)
      .catch(() => caches.match('/index.html'))
  );
});
