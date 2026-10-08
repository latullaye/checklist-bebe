// Settings shared between both phones (Supabase table "reglages": one row per key, value in JSON).
// The phone keeps a copy; its own changes wait in "attente" until they reach the server, and win over it.
//   Prefs.get("temp_interieur", 21)   Prefs.set("lait", { cible: "P50", boires: 8 })   Prefs.on("lait", fn)
(function () {
  const cfg = self.T911 || {};
  const shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  const VALS = "thomas911-reglages", DIRTY = "thomas911-reglages-attente";
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let vals = read(VALS), dirty = read(DIRTY);

  // Copies kept by earlier versions of the app
  try {
    const t = parseFloat(localStorage.getItem("thomas911-temp-interieur"));
    if (vals.temp_interieur == null && t) { vals.temp_interieur = t; if (localStorage.getItem("thomas911-temp-interieur-attente") === "1") dirty.temp_interieur = true; }
    const l = JSON.parse(localStorage.getItem("thomas911-lait"));
    if (vals.lait == null && l) { vals.lait = l; if (localStorage.getItem("thomas911-lait-dirty") === "1") dirty.lait = true; }
    ["thomas911-temp-interieur", "thomas911-temp-interieur-attente", "thomas911-lait", "thomas911-lait-dirty"].forEach((k) => localStorage.removeItem(k));
    write(VALS, vals); write(DIRTY, dirty);
  } catch (e) {}

  const listeners = [];
  const emit = (key) => listeners.forEach(([k, fn]) => { if (k === key || k === "*") try { fn(vals[key], key); } catch (e) {} });
  const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
  }).then((r) => { if (!r.ok) throw new Error(r.status); return r; });

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function get(key, fallback) { return vals[key] == null ? fallback : vals[key]; }
  let timer = null;
  function set(key, value) {
    vals[key] = value; dirty[key] = true;
    write(VALS, vals); write(DIRTY, dirty);
    emit(key);
    clearTimeout(timer); timer = setTimeout(push, 600); // one write after a few quick taps
  }
  let pushing = null;
  function push() {
    const keys = Object.keys(dirty);
    if (!shared || !keys.length) return Promise.resolve();
    if (pushing) return pushing;
    const sent = Object.fromEntries(keys.map((k) => [k, vals[k]]));
    pushing = api("reglages", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(keys.map((cle) => ({ cle, valeur: sent[cle], maj: new Date().toISOString() }))) })
      .then(() => { for (const k of keys) if (same(vals[k], sent[k])) delete dirty[k]; write(DIRTY, dirty); })
      .catch(() => {})
      .finally(() => { pushing = null; });
    return pushing;
  }
  function pull() {
    if (!shared || document.visibilityState !== "visible") return Promise.resolve();
    return push().then(() => api("reglages?select=cle,valeur")).then((r) => r.json()).then((rows) => {
      rows.forEach(({ cle, valeur }) => {
        if (dirty[cle] || same(vals[cle], valeur)) return; // our own change goes first
        vals[cle] = valeur; emit(cle);
      });
      write(VALS, vals);
    }).catch(() => {});
  }
  function on(key, fn) { listeners.push([key, fn]); }

  document.addEventListener("visibilitychange", pull);
  window.addEventListener("online", pull);
  setInterval(pull, 15000); // only fetches while on screen
  setTimeout(pull, 0);
  window.Prefs = { get, set, on, pull, push, shared, pending: () => Object.keys(dirty).length };
})();
