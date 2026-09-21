/**
 * THE REGISTER YOU LAST SAW, WHEN THERE IS NO NETWORK.
 *
 * Scrip's figures are read from the chain at the moment you ask, so almost nothing here is
 * cacheable without lying. Two things are not figures: the app's own static files, and the
 * last answer this browser already received for your register. So:
 *
 *   static build files  cache first, they are content-addressed and never change in place
 *   /api/book/live/…    network first; the last good answer is kept and served when offline,
 *                       and the page says the date it is showing
 *   navigations         network first; a page seen before is served from cache when offline
 *   everything else     straight to the network, never cached
 *
 * Nothing that moves money is cached, and no cached figure is ever presented as current: the
 * register reads `at` off the view it renders and says so.
 */
const VERSION = "scrip-v1";
const SHELL = `${VERSION}-shell`;
const LIVE = `${VERSION}-live`;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/book/live/")) {
    event.respondWith(networkFirst(request, LIVE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL));
  }
});
