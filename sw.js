/* Algo Lab — Service Worker v8 */
const CACHE_NAME = "algo-lab-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./pathfinding.html",
  "./search.html",
  "./database.html",
  "./hypervisor.html",
  "./style.css",
  "./database.css",
  "./hypervisor.css",
  "./lab-common.js",
  "./script.js",
  "./sorting-core.js",
  "./pathfinding.js",
  "./pathfinding-core.js",
  "./search.js",
  "./search-core.js",
  "./database.js",
  "./db-core.js",
  "./hypervisor.js",
  "./hypervisor-core.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Share links carry query strings (?algo=…, ?sample=…, ?scenario=…). Pages are
  // cached without them, so navigations match on the path alone — otherwise a
  // shared link would not open offline.
  const isNavigation = event.request.mode === "navigate";
  const cacheKey = isNavigation ? url.origin + url.pathname : event.request;

  event.respondWith(
    caches.match(cacheKey, { ignoreSearch: isNavigation }).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          }
          return response;
        })
        .catch(() => cached || Response.error());

      return cached || fetched;
    })
  );
});
