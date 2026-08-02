const CACHE = 'atlas-v1';
const PRECACHE = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/kanban.css',
  '/static/mindmap.css',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/share/')) {
    return;
  }

  // Static assets: cache-first (fast loads)
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to cached /
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/'))
  );
});
