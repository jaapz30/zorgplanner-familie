const CACHE_NAME = 'zorgplanner-pwa-v30';

// Absolute paths — werkt op zowel Netlify als Cloudflare Pages
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // nooit vastlopen bij cache-fout
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Laat externe verzoeken (bijv. analytics) passeren
  if (url.origin !== self.location.origin) return;

  // sw.js zelf nooit cachen — altijd netwerk
  if (url.pathname === '/sw.js') return;

  // Navigate requests: netwerk-first, fallback naar cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put('/index.html', copy))
              .catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Overige assets: cache-first, update op achtergrond
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(req, copy))
            .catch(() => {});
        }
        return resp;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
