/* CACHE and FILES are generated from the compiled application by build.mjs. */
const assets = new Set(FILES);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => {
    return cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' })));
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('skewer-shift-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(caches.open(CACHE).then(async (cache) => await cache.match('/index.html') || fetch(request)));
  } else if (assets.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => await cache.match(url.pathname) || fetch(request)));
  }
});
