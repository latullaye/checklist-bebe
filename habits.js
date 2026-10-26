// Good-habits tracking, shared between both phones through Supabase.
// Works offline: the phone keeps a copy and sends unsent ticks when the network is back.
// One row per day and box: { jour: "2026-10-07", cle: "bouche-matin", fait: true, par: "<who ticked it>" }.
(function () {
  const CACHE = "thomas911-habitudes";
  const PENDING = "thomas911-habitudes-attente";
  const DAYS = 40; // how far back we load (the last nail cut can be a few weeks old)
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
  let data = read(CACHE);      // { "2026-10-07": { "bouche-matin": "<who>" or true (not known), ... } }
  let pending = read(PENDING); // { "2026-10-07|bouche-matin": { fait: true, par: "<who>", maj: "<when>" } } (older copies: true)
  let status = shared ? "sync" : "local"; // sync | ok | offline | local

  const listeners = [];
  const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); badge(); };
  const setStatus = (s) => { if (s !== status) { status = s; emit(); } };

  const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
  }).then((r) => { if (!r.ok) throw new Error(r.status); return r; });

  const me = () => (window.Famille && Famille.qui()) || null;
  const unsent = (v) => (v && typeof v === "object" ? v : { fait: !!v, par: null, maj: null });
  function get(day, key) { return !!(data[day] && data[day][key]); }
  // Who ticked it (a first name), or null when it isn't known (ticked before this was noted, or by an older app)
  function who(day, key) { const v = data[day] && data[day][key]; return typeof v === "string" ? v : null; }
  function put(day, key, val, par) {
    data[day] = data[day] || {};
    if (val) data[day][key] = par || true; else delete data[day][key];
  }

  function set(day, key, val) {
    const par = me();
    put(day, key, val, par);
    write(CACHE, data);
    if (shared) { pending[`${day}|${key}`] = { fait: !!val, par, maj: new Date().toISOString() }; write(PENDING, pending); flush(); }
    emit();
  }

  let flushing = null;
  function flush() {
    if (!shared || flushing) return flushing;
    const rows = Object.entries(pending).map(([k, v]) => {
      const [jour, cle] = k.split("|"), p = unsent(v);
      return { jour, cle, fait: p.fait, par: p.par || null, maj: p.maj || new Date().toISOString() };
    });
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
    return flush().then(() => api(`habitudes?select=jour,cle,fait,par&jour=gte.${addDays(today(), -DAYS)}`))
      .then((r) => r.json())
      .then((rows) => {
        const next = {};
        for (const { jour, cle, fait, par } of rows) if (fait) (next[jour] = next[jour] || {})[cle] = par || true;
        // Ticks not sent yet win over what the server has
        for (const [k, v] of Object.entries(pending)) {
          const [jour, cle] = k.split("|"), p = unsent(v);
          next[jour] = next[jour] || {};
          if (p.fait) next[jour][cle] = p.par || true; else delete next[jour][cle];
        }
        data = next;
        write(CACHE, data);
        setStatus("ok");
        emit();
      })
      .catch(() => setStatus("offline"));
  }

  // The ticks of older days, for the full history: { "2026-08-01": { "bouche-matin": "<who>" or true } }, from day `from` to `to`
  function history(from, to) {
    return api(`habitudes?select=jour,cle,par&fait=is.true&jour=gte.${from}&jour=lte.${to}&order=jour.desc&limit=2000`)
      .then((r) => r.json())
      .then((rows) => { const out = {}; for (const { jour, cle, par } of rows) (out[jour] = out[jour] || {})[cle] = par || true; return out; });
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
  // The nails: every N days (the family's setting "ongles_jours", 10 by default), from 6 weeks of age. Due from the Nth day
  // after the last cut, all day long (the evening reminder says it too).
  const NAILS_FROM = 42, NAILS_EVERY = 10;
  const settings = () => { try { return JSON.parse(localStorage.getItem("thomas911-reglages")) || {}; } catch (e) { return {}; } }; // prefs.js's copy
  const nailsEvery = () => { const n = Math.round(Number(settings().ongles_jours)); return n >= 3 && n <= 30 ? n : NAILS_EVERY; };
  const nailsStart = () => { const j = (settings().famille || {}).jour; return /^\d{4}-\d\d-\d\d$/.test(j || "") ? addDays(j, NAILS_FROM) : null; };
  const lastNails = () => Object.keys(data).filter((d) => data[d].ongles).sort().pop() || null;
  function nailsAgo() {
    const last = lastNails();
    return last ? Math.round((new Date(today() + "T12:00:00") - new Date(last + "T12:00:00")) / 864e5) : null;
  }
  const nailsDue = () => { const s = nailsStart(), d = nailsAgo(); return !!s && today() >= s && (d === null || d >= nailsEvery()); };
  // What this moment is about (the home page's "À faire"): the slot's habits, the vitamin D, the bath on its evening, the nails
  // on their day
  const todo = (slot = slotNow()) => [...HABITS.map(([h]) => `${h}-${slot}`), "vitd", ...(slot === "soir" && bathDue() ? ["bain"] : []),
    ...(nailsDue() ? ["ongles"] : [])];
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

  window.Habits = { SLOTS, HABITS, DAILY, REMIND, shared, DAYS, today, addDays, slotNow, get, who, set, refresh, history, progress, lastBath, bathAgo, bathDue,
    nailsEvery, nailsStart, nailsAgo, nailsDue, todo, left,
    onChange, api, tz,
    get status() { return status; } };
})();
