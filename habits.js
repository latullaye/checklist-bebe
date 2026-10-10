// Good-habits tracking, shared between both phones through Supabase.
// Works offline: the phone keeps a copy and sends unsent ticks when the network is back.
// One row per day and box: { jour: "2026-10-07", cle: "bouche-matin", fait: true }.
(function () {
  const CACHE = "thomas911-habitudes";
  const PENDING = "thomas911-habitudes-attente";
  const DAYS = 14; // how far back we load
  const cfg = self.T911 || {};
  const shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);

  const SLOTS = [["matin", "Matin"], ["midi", "Midi"], ["soir", "Soir"]];
  const HABITS = [["bouche", "Exercices de bouche", ""], ["perinee", "Rééducation périnéenne", ""]];
  // Tight follow-up: these boxes count in the daily progress and the reminders. The bath doesn't.
  // Vitamin D is once a day, in the morning reminder.
  const DAILY = HABITS.flatMap(([h]) => SLOTS.map(([s]) => `${h}-${s}`)).concat("vitd");
  // Boxes a reminder covers, for "C'est fait"
  const REMIND = (slot) => HABITS.map(([h]) => `${h}-${slot}`).concat(slot === "matin" ? ["vitd"] : []);

  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayOf(new Date());
  const addDays = (day, n) => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n); return dayOf(d); };
  // Slot of the moment: matin until 11 h, midi until 15 h, soir after.
  const slotNow = () => { const h = new Date().getHours(); return h < 11 ? "matin" : h < 15 ? "midi" : "soir"; };

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let data = read(CACHE);      // { "2026-10-07": { "bouche-matin": true, ... } }
  let pending = read(PENDING); // { "2026-10-07|bouche-matin": true }
  let status = shared ? "sync" : "local"; // sync | ok | offline | local

  const listeners = [];
  const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); badge(); };
  const setStatus = (s) => { if (s !== status) { status = s; emit(); } };

  const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
  }).then((r) => { if (!r.ok) throw new Error(r.status); return r; });

  function get(day, key) { return !!(data[day] && data[day][key]); }
  function put(day, key, val) {
    data[day] = data[day] || {};
    if (val) data[day][key] = true; else delete data[day][key];
  }

  function set(day, key, val) {
    put(day, key, val);
    write(CACHE, data);
    if (shared) { pending[`${day}|${key}`] = !!val; write(PENDING, pending); flush(); }
    emit();
  }

  let flushing = null;
  function flush() {
    if (!shared || flushing) return flushing;
    const rows = Object.entries(pending).map(([k, fait]) => { const [jour, cle] = k.split("|"); return { jour, cle, fait }; });
    if (!rows.length) return Promise.resolve();
    const sent = { ...pending };
    flushing = api("habitudes", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) })
      .then(() => {
        // Keep anything ticked while sending
        for (const k in sent) if (pending[k] === sent[k]) delete pending[k];
        write(PENDING, pending);
        setStatus("ok");
      })
      .catch(() => setStatus("offline"))
      .finally(() => { flushing = null; if (Object.keys(pending).length && status === "ok") flush(); });
    return flushing;
  }

  function refresh() {
    if (!shared) return Promise.resolve();
    return flush().then(() => api(`habitudes?select=jour,cle,fait&jour=gte.${addDays(today(), -DAYS)}`))
      .then((r) => r.json())
      .then((rows) => {
        const next = {};
        for (const { jour, cle, fait } of rows) if (fait) (next[jour] = next[jour] || {})[cle] = true;
        // Ticks not sent yet win over what the server has
        for (const [k, v] of Object.entries(pending)) {
          const [jour, cle] = k.split("|");
          next[jour] = next[jour] || {};
          if (v) next[jour][cle] = true; else delete next[jour][cle];
        }
        data = next;
        write(CACHE, data);
        setStatus("ok");
        emit();
      })
      .catch(() => setStatus("offline"));
  }

  // Ticks done today on the reminder boxes, e.g. 4 of 6.
  function progress(day = today()) {
    return { done: DAILY.filter((k) => get(day, k)).length, total: DAILY.length };
  }
  // Last bath day in what we have, or null.
  function lastBath() {
    return Object.keys(data).filter((d) => data[d].bain).sort().pop() || null;
  }
  // The bath: every 2 or 3 days, in the evening. Due from the 2nd day after the last one (the reminders say the same).
  const BATH_EVERY = 2;
  function bathAgo() {
    const last = lastBath();
    return last ? Math.round((new Date(today() + "T12:00:00") - new Date(last + "T12:00:00")) / 864e5) : null;
  }
  const bathDue = () => { const d = bathAgo(); return d === null || d >= BATH_EVERY; };
  // What this moment is about (the home page's "À faire"): the slot's habits, the vitamin D, the bath on its evening
  const todo = (slot = slotNow()) => [...HABITS.map(([h]) => `${h}-${slot}`), "vitd", ...(slot === "soir" && bathDue() ? ["bain"] : [])];
  const left = () => todo().filter((k) => !get(today(), k));

  // The app icon follows what's left. iPhone: the red badge with the number (the reminder sets it, every tick updates it;
  // the doses due are added by pastille.js). Android has no number for web apps: its dot stays while the reminder is in the
  // tray, so the reminder goes once it's all done.
  function badge() {
    const n = left().length;
    try {
      if (window.Pastille) Pastille.set("habitudes", n);
      else if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
    } catch (e) {}
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg && reg.getNotifications && reg.getNotifications({ tag: "rappel" }))
      .then((list) => (list || []).forEach((note) => {
        const { jour, cles, bain } = note.data || {};
        if (!jour || !cles) return;
        if (jour < today() || (cles.every((k) => get(jour, k)) && (!bain || get(jour, "bain")))) note.close();
      }))
      .catch(() => {});
  }

  // The phone's time zone: reminders come at 9:00, 12:30 and 17:30 wherever it is (at home or travelling).
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } };
  const TZ_SENT = "thomas911-fuseau";
  // After a trip, tell the server this phone's new zone, and who uses it (so a dose noted here is announced to the other
  // phone only). Only when one of them changed and the phone gets reminders.
  function syncTz() {
    const zone = tz(), qui = (window.Famille && Famille.qui()) || "";
    if (!shared || !zone || !("serviceWorker" in navigator)) return;
    let sent = null;
    try { sent = localStorage.getItem(TZ_SENT); } catch (e) {}
    const mark = qui ? `${zone}|${qui}` : zone;
    if (sent === mark) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager && reg.pushManager.getSubscription())
      .then((sub) => sub && api(`abonnements?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(qui ? { tz: zone, qui } : { tz: zone }) })
        .then(() => { try { localStorage.setItem(TZ_SENT, mark); } catch (e) {} }))
      .catch(() => {});
  }

  function onChange(fn) { listeners.push(fn); fn(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { refresh(); syncTz(); } });
  window.addEventListener("online", refresh);
  syncTz();
  badge();

  window.Habits = { SLOTS, HABITS, DAILY, REMIND, shared, today, addDays, slotNow, get, set, refresh, progress, lastBath, bathAgo, bathDue, todo, left,
    onChange, api, tz,
    get status() { return status; } };
})();
