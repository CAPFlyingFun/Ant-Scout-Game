/* ============================================================
   sw.js — Ant Scout service worker
   Makes the game installable and fully playable offline.
   Strategy: cache-first for the game shell (fast, offline-proof),
   network passthrough for the two live-weather APIs.
   Bump CACHE_NAME whenever you change any cached file below.
   ============================================================ */
const CACHE_NAME = 'ant-scout-v2';

// All paths are RELATIVE so this works at any hosting path
// (e.g. /ant-scout-game/) without edits.
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/state.js',
  './js/core.js',
  './js/world.js',
  './js/weather.js',
  './js/input.js',
  './js/update.js',
  './js/render.js',
  './js/main.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-192x192.png',
  './icons/icon-maskable-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32x32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Don't let one missing/renamed asset abort the whole install.
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Only handle GET.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept cross-origin requests — the live-weather APIs
  // (api.open-meteo.com, api.zippopotam.us) must reach the network
  // directly and handle their own CORS / offline errors. The game
  // already degrades gracefully when they fail.
  if (url.origin !== location.origin) return;

  // Cache-first for the game shell; update the cache in the background.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      // Serve cache immediately if we have it; otherwise wait for network,
      // and if that also fails on a navigation, show the offline page.
      return cached || network.then(res => {
        if (res) return res;
        if (event.request.mode === 'navigate') return caches.match('./offline.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
