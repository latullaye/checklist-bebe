// Keeps a copy of the app on the phone so it opens without network.
// Change VERSION whenever a file changes, so phones pick up the new copy.
const VERSION = "thomas911-v27";
importScripts("config.js"); // self.T911: where to record "C'est fait" from a reminder
const FILES = [
  "./",
  "./index.html",
  "./checklist.html",
  "./bruit.html",
  "./habitudes.html",
  "./meteo.html",
  "./habiller.html",
  "./age.html",
  "./croissance.html",
  "./config.js",
  "./habits.js",
  "./thomas.js",
  "./who-boys.js",
  "./common.css",
  "./weather.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-poussette.svg",
  "./icon-bruit.svg",
  "./icon-habitudes.svg",
  "./icon-habiller.svg",
  "./icon-age.svg",
  "./icon-croissance.svg",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./fonts/bricolage-grotesque-latin-600-normal.woff2",
  "./fonts/bricolage-grotesque-latin-800-normal.woff2",
  "./fonts/ubuntu-latin-500-normal.woff2",
  "./fonts/exo-2-latin-700-normal.woff2",
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

// ---------- Reminders ----------
// The GitHub job sends { title, body, jour, slot, cles } (cles: the boxes the reminder is about). Android shows the two quick actions; iPhone only the tap.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || "THOMAS911", {
    body: d.body || "", tag: "rappel", renotify: true,
    icon: "icon-192.png",
    data: { jour: d.jour, slot: d.slot, cles: d.cles },
    actions: [{ action: "fait", title: "C'est fait" }, { action: "plus-tard", title: "Plus tard" }]
  }));
});

function openPage(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const page = list.find((c) => c.url.includes("habitudes.html")) || list[0];
    if (page) return page.navigate(url).then((c) => (c || page).focus()).catch(() => page.focus());
    return self.clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (e) => {
  const n = e.notification, { jour, slot, cles } = n.data || {};
  n.close();
  if (e.action === "plus-tard") return;
  if (e.action === "fait" && jour && slot) {
    // Tick the boxes the reminder was about; if the network fails, the page does it.
    const cfg = self.T911 || {};
    const keys = cles || ["bouche", "perinee"].map((h) => `${h}-${slot}`).concat(slot === "matin" ? ["vitd"] : []);
    const rows = keys.map((cle) => ({ jour, cle, fait: true }));
    e.waitUntil(fetch(`${cfg.SUPABASE_URL}/rest/v1/habitudes`, {
      method: "POST",
      headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    }).then((r) => { if (!r.ok) throw new Error(r.status); })
      .catch(() => openPage(`habitudes.html?fait=${encodeURIComponent(jour + "|" + slot)}`)));
    return;
  }
  e.waitUntil(openPage("habitudes.html"));
});
