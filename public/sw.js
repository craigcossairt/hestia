// Hestia service worker — minimal offline + speed cache.
//
// Strategy:
//   - Same-origin GET HTML  → network-first, fallback to cache, then offline.html
//   - Same-origin GET static (_next/static, fonts, manifest, icons)
//                             → cache-first (immutable URLs)
//   - Same-origin GET API    → network-only (no offline action support)
//   - Cross-origin           → network-only
//
// Cache name is versioned so a deploy invalidates everything.

const VERSION = "v3";
const STATIC_CACHE = `hestia-static-${VERSION}`;
const PAGES_CACHE = `hestia-pages-${VERSION}`;

const PRECACHE_URLS = ["/", "/login", "/manifest.webmanifest", "/icon", "/apple-icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API routes are never offline-safe.
  if (url.pathname.startsWith("/api/")) return;

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname.startsWith("/favicon")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((res) => {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
              return res;
            })
            .catch(() => cached || Response.error()),
      ),
    );
    return;
  }

  // Pages: network-first, fallback to cached version
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});
