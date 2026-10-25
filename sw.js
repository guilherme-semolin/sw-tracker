// Offline cache: app shell precached, images and data cached on first use.
const VERSION = 'v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'store.js', 'config.js', 'manifest.webmanifest', 'data/seed.json', 'data/awaken2.json', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('shell-' + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== 'shell-' + VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return; // never cache API calls
  if (url.origin === location.origin && url.pathname.includes('/img/')) {
    // Images never change: cache-first.
    e.respondWith(caches.open('img').then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Everything else: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net')) {
        const copy = r.clone(); caches.open('shell-' + VERSION).then((c) => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
