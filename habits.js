// Good-habits tracking, shared between both phones through Supabase.
// Works offline: the phone keeps a copy and sends unsent ticks when the network is back.
// One row per day and box: { jour: "2026-10-07", cle: "bouche-matin", fait: true, par: "<who ticked it>" }.
(function () {
  const CACHE = "thomas911-habitudes";
  const PENDING = "thomas911-habitudes-attente";
  const DAYS = 40; // how far back we load (a habit done every 30 days at most: its last time is in there)
  const cfg = self.T911 || {};
  const shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);

  const SLOTS = [["matin", "Matin"], ["midi", "Midi"], ["soir", "Soir"]];
  const ORDER = { matin: 0, midi: 1, soir: 2 };
  // The habits the app knows. The family turns each one on or off and sets its rhythm in Settings (shared setting "habitudes"):
  // - "jour": every day, at the chosen moments: one box per moment ("bouche-matin"), or a single box when there is only one
  //   ("vitd"); they make the day's progress (2/7) and go in the grid of the Habits screen;
  // - "jours": every N days from the last time ("bain", "ongles"), on its own line, due from the Nth day, reminded at its moment;
  //   depuis: not before that many days of age (the date of birth is in the family's settings).
  // The reminders (function "rappels") and Claude (function "mcp") follow the same rules.
  const CATALOG = [
    { id: "bouche", nom: "Exercices de bouche", court: "Bouche", col: "Bouche", rythme: "jour", moments: ["matin", "midi", "soir"] },
    { id: "perinee", nom: "Rééducation périnéenne", court: "Rééducation", col: "Périnée", rythme: "jour", moments: ["matin", "midi", "soir"] },
    { id: "vitd", nom: "Vitamine D", court: "Vitamine D", col: "Vit. D", rythme: "jour", moments: ["matin"] },
    { id: "bain", nom: "Bain", court: "Bain", col: "Bain", rythme: "jours", tous: 2, moment: "soir" },
    { id: "ongles", nom: "Couper les ongles", court: "Ongles", col: "Ongles", rythme: "jours", tous: 10, moment: "soir", depuis: 42 }
  ];
  const EVERY_MIN = 2, EVERY_MAX = 30;
  const settings = () => { try { return JSON.parse(localStorage.getItem("thomas911-reglages")) || {}; } catch (e) { return {}; } }; // prefs.js's copy
  // A habit as the family set it (anything missing or odd falls back to the catalog)
  function resolve(base, saved, legacy) {
    const v = saved && typeof saved === "object" ? saved : {};
    const rythme = v.rythme === "jour" || v.rythme === "jours" ? v.rythme : base.rythme;
    const moments = Array.isArray(v.moments) ? SLOTS.map(([s]) => s).filter((s) => v.moments.includes(s)) : [];
    const n = Math.round(Number(v.tous ?? legacy));
    return { ...base, actif: v.actif !== false, rythme,
      moments: moments.length ? moments : base.moments || [base.moment || "matin"],
      tous: n >= EVERY_MIN && n <= EVERY_MAX ? n : base.tous || 7,
      moment: ORDER[v.moment] != null ? v.moment : base.moment || (base.moments || ["matin"]).at(-1) };
  }
  // All of them, on or off (the nails' rhythm used to be its own setting, "ongles_jours")
  function habits() {
    const s = settings(), saved = s.habitudes || {};
    return CATALOG.map((h) => resolve(h, saved[h.id], h.id === "ongles" ? s.ongles_jours : undefined));
  }
  const active = () => habits().filter((h) => h.actif);
  const byId = (id) => habits().find((h) => h.id === String(id).split("-")[0]) || null;
  // Its boxes for a day, and the one for a moment of the day (null: none then)
  const boxes = (h) => (h.rythme === "jour" && h.moments.length > 1 ? h.moments.map((m) => `${h.id}-${m}`) : [h.id]);
  const boxAt = (h, slot) => (h.rythme !== "jour" ? null : h.moments.length > 1 ? (h.moments.includes(slot) ? `${h.id}-${slot}` : null)
    : h.moments[0] === slot ? h.id : null);
  // The once-a-day box and the every-N-days ones: the moment they come at
  const momentOf = (h) => (h.rythme === "jour" ? h.moments[0] : h.moment);
  const daily = () => active().filter((h) => h.rythme === "jour");
  const DAILY = () => daily().flatMap(boxes);
  // Boxes a reminder covers, for "C'est fait"
  const REMIND = (slot) => daily().map((h) => boxAt(h, slot)).filter(Boolean);

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

  // Ticks done today on the daily boxes, e.g. 4 of 7.
  function progress(day = today()) {
    const all = DAILY();
    return { done: all.filter((k) => get(day, k)).length, total: all.length };
  }
  // The every-N-days ones: the last time (in what we have), how long ago, from when (age), due, late
  const lastTime = (id) => Object.keys(data).filter((d) => data[d][id]).sort().pop() || null;
  const daysSince = (day) => Math.round((new Date(today() + "T12:00:00") - new Date(day + "T12:00:00")) / 864e5);
  function ago(h) { const last = lastTime(typeof h === "string" ? h : h.id); return last ? daysSince(last) : null; }
  function start(h) {
    if (!h.depuis) return null;
    const j = (settings().famille || {}).jour;
    return /^\d{4}-\d\d-\d\d$/.test(j || "") ? addDays(j, h.depuis) : "9999-12-31"; // no date of birth: not yet
  }
  const started = (h, day = today()) => !h.depuis || day >= start(h);
  const due = (h) => { if (h.rythme !== "jours" || !started(h)) return false; const d = ago(h); return d === null || d >= h.tous; };
  const late = (h) => { if (h.rythme !== "jours" || !started(h)) return false; const d = ago(h); return d !== null && d > h.tous; };
  // What this moment is about (the home page's "À faire"): the slot's boxes; the once-a-day box and the every-N-days ones on
  // their day, from their moment on (the vitamin D all day, the bath in the evening)
  function todo(slot = slotNow()) {
    const now = ORDER[slot];
    return active().flatMap((h) => {
      if (h.rythme === "jour" && h.moments.length > 1) return h.moments.includes(slot) ? [`${h.id}-${slot}`] : [];
      if (now < ORDER[momentOf(h)]) return [];
      return h.rythme === "jour" || due(h) ? [h.id] : [];
    });
  }
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

  window.Habits = { SLOTS, ORDER, CATALOG, EVERY_MIN, EVERY_MAX, shared, DAYS, today, addDays, slotNow, get, who, set, refresh, history,
    habits, active, byId, boxes, boxAt, momentOf, daily, DAILY, REMIND, progress, ago, start, started, due, late, todo, left,
    onChange, api, tz,
    get status() { return status; } };
})();
