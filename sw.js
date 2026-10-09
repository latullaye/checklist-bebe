// Keeps a copy of the app on the phone so it opens without network.
// Change VERSION whenever a file changes, so phones pick up the new copy.
const VERSION = "thomas911-v38";
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
  "./sante.html",
  "./config.js",
  "./famille.js",
  "./sante.js",
  "./markdown.js",
  "./photos.js",
  "./assistant.js",
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
  "./notif/medicament.png",
  "./notif/rdv.png",
  "./notif/note.png",
  "./icon-poussette.svg",
  "./icon-bruit.svg",
  "./icon-habitudes.svg",
  "./icon-habiller.svg",
  "./icon-age.svg",
  "./icon-croissance.svg",
  "./icon-sante.svg",
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
      // "thomas911-famille" holds the family code for the reminders' quick actions (famille.js), "thomas911-photos" the
      // health photos kept on the phone (photos.js): they stay
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FAMILLE && k !== "thomas911-photos").map((k) => caches.delete(k))))
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
// The habits function sends { title, body, jour, slot, cles, reste } (cles: the boxes the reminder is about, reste: what's left
// for this moment, the bath included). The health function sends { kind: "prise" | "rdv" | "note", title, body, med | rdv | probleme }.
// Android shows the picture and the quick actions; iPhone only the text (with an emoji in front) and the tap.
const EMOJI = { matin: "☀️", midi: "🌞", soir: "🌙", bain: "🛁", medicament: "💊", rdv: "📅", note: "📝" };
const ua = self.navigator.userAgent || "";
const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && !/Chrome|Firefox|Edg/.test(ua));
// The family code and who uses this phone, kept by famille.js for these actions
const FAMILLE = "thomas911-famille";
const famille = () => caches.open(FAMILLE).then((c) => c.match("famille.json")).then((r) => (r ? r.json() : {})).catch(() => ({}));
const HEALTH = {
  prise: (d) => ({ pic: "medicament", tag: `prise-${d.med}`, data: { kind: "prise", med: d.med, at: d.at },
    actions: [{ action: "donne", title: "Donné" }, { action: "plus-tard", title: "Plus tard" }] }),
  rdv: (d) => ({ pic: "rdv", tag: `rdv-${d.rdv}`, data: { kind: "rdv", rdv: d.rdv }, actions: [] }),
  note: (d) => ({ pic: "note", tag: `note-${d.probleme}`, data: { kind: "note", probleme: d.probleme }, actions: [{ action: "noter", title: "Noter" }] })
};
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) {}
  if (HEALTH[d.kind]) {
    const h = HEALTH[d.kind](d), title = d.title || "THOMAS911";
    e.waitUntil(self.registration.showNotification(apple ? `${EMOJI[h.pic]} ${title}` : title, {
      body: d.body || "", tag: h.tag, renotify: true, icon: `notif/${h.pic}.png`, badge: "notif/badge.png", data: h.data, actions: h.actions
    }));
    return;
  }
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
    const page = list.find((c) => c.url.includes(url.split(/[?#]/)[0])) || list[0];
    if (page) return page.navigate(url).then((c) => (c || page).focus()).catch(() => page.focus());
    return self.clients.openWindow(url);
  });
}

// Writes to the shared tables with the family code; an error when it fails (the page then does it)
function post(table, rows) {
  const cfg = self.T911 || {};
  return famille().then(({ code }) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: cfg.SUPABASE_KEY, "x-famille": code || "", "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  })).then((r) => { if (!r.ok) throw new Error(r.status); });
}

self.addEventListener("notificationclick", (e) => {
  const n = e.notification, data = n.data || {}, { jour, slot, cles } = data;
  n.close();
  if (e.action === "plus-tard") return;
  // Health: give the dose right from the reminder, or open what it's about
  if (data.kind === "prise") {
    if (e.action === "donne") {
      e.waitUntil(famille().then(({ qui }) => post("sante_prises", [{ id: crypto.randomUUID(), medicament: data.med, le: new Date().toISOString(),
        fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone || null, par: qui || null }]))
        .catch(() => openPage(`sante.html#donne/${data.med}`)));
      return;
    }
    e.waitUntil(openPage(`sante.html#m/${data.med}`));
    return;
  }
  if (data.kind === "rdv") { e.waitUntil(openPage(`sante.html#r/${data.rdv}`)); return; }
  if (data.kind === "note") { e.waitUntil(openPage(`sante.html#noter/${data.probleme}`)); return; }
  if (e.action === "fait" && jour && slot) {
    // Tick the boxes the reminder was about; if the network fails, the page does it.
    const keys = cles || ["bouche", "perinee"].map((h) => `${h}-${slot}`).concat(slot === "matin" ? ["vitd"] : []);
    e.waitUntil(post("habitudes", keys.map((cle) => ({ jour, cle, fait: true })))
      .catch(() => openPage(`habitudes.html?fait=${encodeURIComponent(jour + "|" + slot)}`)));
    return;
  }
  e.waitUntil(openPage("habitudes.html"));
});
