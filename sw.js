// Keeps a copy of the app on the phone so it opens without network.
// Change VERSION whenever a file changes, so phones pick up the new copy.
const VERSION = "sortie-bebe-v7";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./fonts/bricolage-grotesque-latin-600-normal.woff2",
  "./fonts/bricolage-grotesque-latin-800-normal.woff2",
  "./fonts/ubuntu-latin-500-normal.woff2",
  "./fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "./fonts/atkinson-hyperlegible-latin-700-normal.woff2"
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, which GitHub Pages keeps for 10 min:
  // without it, the new copy could be filled with the old files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first: instant and offline. Page navigations fall back to the cached index.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Other sites (the weather) go straight to the network, never cached.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).catch(() =>
        e.request.mode === "navigate" ? caches.match("./index.html") : Response.error()
      )
    )
  );
});
