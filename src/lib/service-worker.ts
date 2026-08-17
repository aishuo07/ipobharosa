export const SERVICE_WORKER_CACHE_PREFIX = "ipobharosa-shell";
export const SERVICE_WORKER_CACHE_VERSION = "v1";
export const OFFLINE_URL = "/offline";

export const SERVICE_WORKER_SOURCE = `
const CACHE_PREFIX = ${JSON.stringify(SERVICE_WORKER_CACHE_PREFIX)};
const CACHE_NAME = CACHE_PREFIX + "-" + ${JSON.stringify(SERVICE_WORKER_CACHE_VERSION)};
const OFFLINE_URL = ${JSON.stringify(OFFLINE_URL)};
const PRIVATE_PREFIXES = ["/api/", "/admin", "/login", "/watchlist"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL);
      return offline ?? Response.error();
    })
  );
});
`.trim();
