// Keeps a copy of the app on the phone so it opens without network.
// Change VERSION whenever a file changes, so phones pick up the new copy.
const VERSION = "thomas911-v35";
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
  "./reglages.html",
  "./config.js",
  "./habits.js",
  "./thomas.js",
  "./sync.js",
  "./prefs.js",
  "./growth.js",
  "./notifs.js",
  "./who-boys.js",
  "./common.css",
  "./weather.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./notif/matin.png",
  "./notif/midi.png",
  "./notif/soir.png",
  "./notif/bain.png",
  "./notif/badge.png",
  "./icon-poussette.svg",
  "./icon-bruit.svg",
  "./icon-habitudes.svg",
  "./icon-habiller.svg",
  "./icon-age.svg",
  "./icon-croissance.svg",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./fonts/ubuntu-latin-500-normal.woff2",
  "./fonts/ubuntu-latin-700-normal.woff2",
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
// The reminder function sends { title, body, jour, slot, cles, reste } (cles: the boxes the reminder is about, reste: what's left
// for this moment, the bath included). Android shows the picture and the two quick actions; iPhone only the text and the tap.
const EMOJI = { matin: "☀️", midi: "🌞", soir: "🌙", bain: "🛁" };
const ua = self.navigator.userAgent || "";
const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && !/Chrome|Firefox|Edg/.test(ua));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) {}
  const bain = /bain/.test(d.body || ""), cles = d.cles || [];
  // What it's about: morning sun, midday sun, evening moon, or the duck when the bath is in it.
  // Android shows the app icon on the left already, so it goes in the picture on the right (the badge goes in the status bar);
  // iPhone ignores the picture, so it goes at the start of the title.
  const pic = bain ? "bain" : ["matin", "midi", "soir"].includes(d.slot) ? d.slot : null;
  const title = d.title || "THOMAS911";
  // The red badge on the app icon (iPhone; Android shows its own dot while the reminder is there)
  const n = d.reste ?? cles.length + (bain && !cles.includes("bain") ? 1 : 0);
  const count = self.navigator.setAppBadge && n ? self.navigator.setAppBadge(n).catch(() => {}) : null;
  e.waitUntil(Promise.all([count, self.registration.showNotification(apple && pic ? `${EMOJI[pic]} ${title}` : title, {
    body: d.body || "", tag: "rappel", renotify: true,
    icon: pic ? `notif/${pic}.png` : "icon-192.png", badge: "notif/badge.png",
    data: { jour: d.jour, slot: d.slot, cles: d.cles, bain },
    actions: [{ action: "fait", title: "C'est fait" }, { action: "plus-tard", title: "Plus tard" }]
  })]));
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
