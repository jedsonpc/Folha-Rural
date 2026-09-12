const CACHE_NAME = "folha-rural-shell-v60-folha-rural-1.4.72";
const DATA_CACHE_NAME = "folha-rural-data-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/folha-rural.ico",
  "/folha-rural-32.png",
  "/folha-rural-192.png",
  "/folha-rural-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_OFFLINE_DATA")
    event.waitUntil(caches.delete(DATA_CACHE_NAME));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    const allowed = ["/api/auth", "/api/companies", "/api/data", "/api/services", "/api/hr", "/api/unions", "/api/tax-tables", "/api/inventory", "/api/launches"];
    if (!allowed.some((path) => url.pathname === path)) return;
    url.searchParams.delete("fresh");
    url.searchParams.sort();
    const cacheRequest = new Request(url.toString(), { method: "GET" });
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(DATA_CACHE_NAME).then((cache) => cache.put(cacheRequest, response.clone()));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(cacheRequest);
          return cached || new Response(JSON.stringify({ error: "Dados não baixados para uso offline." }), {
            status: 503,
            headers: { "Content-Type": "application/json", "X-Offline-Cache": "miss" },
          });
        }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
  );
});
