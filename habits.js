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
  const HABITS = [["bouche", "Exercices de bouche", "Thomas"], ["perinee", "Rééducation périnéenne", "Edith"]];
  // Tight follow-up: these boxes count in the daily progress and the reminders. The bath doesn't.
  const DAILY = HABITS.flatMap(([h]) => SLOTS.map(([s]) => `${h}-${s}`));

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
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) {} });
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

  function onChange(fn) { listeners.push(fn); fn(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.addEventListener("online", refresh);

  window.Habits = { SLOTS, HABITS, DAILY, shared, today, addDays, slotNow, get, set, refresh, progress, lastBath, onChange, api,
    get status() { return status; } };
})();
