const CACHE = 'atlas-v3';
const PRECACHE = [
  '/',
  '/static/style.css',
  '/static/pygments.css',
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

  // Static assets: network-first, cached copy only as an offline fallback.
  // Cache-first-forever (the old strategy) meant a deploy that fixed a JS/CSS
  // bug never actually reached a browser that had already cached the buggy
  // version — no amount of redeploying helps until that one cache entry
  // happens to get evicted or the CACHE version above gets bumped. Checking
  // the network first costs nothing when online (which is the common case)
  // and still works offline via the fallback.
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to cached /
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/'))
  );
});
