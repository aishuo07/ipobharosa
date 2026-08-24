export const SERVICE_WORKER_CACHE_PREFIX = "ipobharosa";
export const SERVICE_WORKER_CACHE_VERSION = "v2";
export const OFFLINE_URL = "/offline";

export const SERVICE_WORKER_SOURCE = `
const CACHE_PREFIX = ${JSON.stringify(SERVICE_WORKER_CACHE_PREFIX)};
const CACHE_VERSION = ${JSON.stringify(SERVICE_WORKER_CACHE_VERSION)};
const SHELL_CACHE = CACHE_PREFIX + "-shell-" + CACHE_VERSION;
const DATA_CACHE = CACHE_PREFIX + "-data-" + CACHE_VERSION;
const OFFLINE_URL = ${JSON.stringify(OFFLINE_URL)};
const PRIVATE_PREFIXES = ["/api/", "/admin", "/login", "/watchlist"];
const STATIC_EXTENSIONS = [".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll([
        new Request(OFFLINE_URL, { cache: "reload" }),
        new Request("/icons/icon-192.png"),
        new Request("/icons/icon-512.png"),
        new Request("/icons/apple-touch-icon.png"),
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  // Static assets: cache-first
  if (STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API data: network-first with cache fallback
  if (url.pathname.startsWith("/api/public/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation: network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? Response.error();
        })
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
`.trim();
