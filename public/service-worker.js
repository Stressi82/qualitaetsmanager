const CACHE = 'qmb-cloudflare-v11-0-43-account-recovery';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=11.0.43-cloudflare-recovery',
  './account.css?v=11.0.43-cloudflare-recovery',
  './legal.css?v=11.0.43-cloudflare-recovery',
  './rechtliches.html',
  './account-client.js?v=11.0.43-cloudflare-recovery',
  './data.js?v=11.0.43-cloudflare-recovery',
  './app.js?v=11.0.43-cloudflare-recovery',
  './lernmodule.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
  );
});
