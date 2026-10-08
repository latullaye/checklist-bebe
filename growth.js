// Growth measures, shared by the growth screen and the home page (needs who-boys.js and thomas.js).
// - WHO 2006 percentiles (boys): LMS tables, z-scores, percentile labels.
// - The shared table "mesures", cached on the phone. Saves and deletions go through an outbox:
//   they show right away, are sent as soon as possible, and wait there while offline.
(function () {
  const nf = (n, d = 0) => n.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- WHO percentiles ----------
  const W = self.WHO_BOYS;
  function lms(table, x) { // x: age in days (or length in cm for wfl); linear between table rows
    const t = W[table], f = (x - t.from) / t.step;
    if (f < -0.5 || f > t.M.length - 0.5) return null;
    const i = Math.max(0, Math.min(t.M.length - 2, Math.floor(f))), k = Math.max(0, Math.min(1, f - i));
    const at = (a) => a[i] + (a[i + 1] - a[i]) * k;
    return { L: Array.isArray(t.L) ? at(t.L) : t.L, M: at(t.M), S: at(t.S) };
  }
  const atZ = ({ L, M, S }, z) => (L ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z));
  function zScore(table, x, v) {
    const p = lms(table, x); if (!p) return null;
    const { L, M, S } = p;
    let z = L ? (Math.pow(v / M, L) - 1) / (L * S) : Math.log(v / M) / S;
    // WHO "restricted" method beyond ±3 SD for weight-based indicators
    if ((table === "wfa" || table === "wfl") && Math.abs(z) > 3) {
      const s3 = atZ(p, 3 * Math.sign(z)), s2 = atZ(p, 2 * Math.sign(z));
      z = Math.sign(z) * (3 + Math.abs((v - s3) / (s3 - s2)));
    }
    return z;
  }
  function phi(z) { // standard normal CDF
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
  }
  const pctText = (z) => { const p = phi(z) * 100; return p < 1 || p > 99 ? `P${nf(p, 1)}` : `P${Math.round(p)}`; };
  const CURVES = [["P3", -1.881, "p3"], ["P15", -1.036, "p15"], ["P50", 0, "p50"], ["P85", 1.036, "p15"], ["P97", 1.881, "p3"]];

  // ---------- Measures ----------
  const DAY_MS = 864e5;
  const tsOf = (r) => Date.parse(r.pese_le) || Date.parse(r.jour + "T12:00:00Z");
  // Weighings for charts and gains: percentiles use the age in days like the WHO tools
  // (date of the measure minus date of birth); the exact time gives the gain per day.
  function weights(rows) {
    return rows.filter((r) => r.poids_g != null).map((r) => {
      const t = tsOf(r), age = Thomas.daysBetween(Thomas.BIRTH_DAY, r.jour), v = r.poids_g / 1000;
      return { row: r, day: r.jour, t, age, ageF: (t - Thomas.BIRTH) / DAY_MS, v, z: zScore("wfa", age, v) };
    }).sort((a, b) => a.t - b.t);
  }
  // Grams per day between two weighings, from their exact times. Under 12 h apart the number means nothing.
  const MIN_GAP = 0.5;
  function gainOf(pts, i) {
    const p = pts[i];
    for (let j = i - 1; j >= 0; j--) {
      const d = (p.t - pts[j].t) / DAY_MS;
      if (d >= MIN_GAP) return { g: (p.v - pts[j].v) * 1000 / d, days: d, from: pts[j] };
    }
    return null;
  }

  // ---------- Shared table, cache and outbox ----------
  const cfg = self.T911 || {};
  const shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  const CACHE = "thomas911-mesures", OUTBOX = "thomas911-outbox";
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let server = read(CACHE, []), outbox = read(OUTBOX, []), error = "";
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) {} });
  const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
  }).then(async (r) => { if (!r.ok) { const e = new Error(await r.text() || r.status); e.http = r.status; throw e; } return r; });
  const uuid = () => (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));

  // What the screens show: the server copy with the waiting changes on top (marked _pending)
  function rows() {
    const out = new Map(server.map((r) => [r.id, r]));
    outbox.forEach((op) => { if (op.del) out.delete(op.del); else out.set(op.row.id, { ...op.row, _pending: true }); });
    return [...out.values()].sort((a, b) => tsOf(a) - tsOf(b));
  }
  function load() {
    if (!shared) return Promise.resolve();
    return flush().then(() => api("mesures?select=id,jour,pese_le,fuseau,poids_g,taille_cm,pc_cm,note&order=pese_le.asc,cree.asc"))
      .then((r) => r.json()).then((data) => { server = data; write(CACHE, server); emit(); })
      .catch(() => {});
  }
  function queue(op) { outbox.push(op); write(OUTBOX, outbox); error = ""; emit(); flush().then(() => outbox.length || load()); }
  const save = (row) => queue({ row: { ...row, id: row.id || uuid() } });
  const remove = (id) => queue({ del: id });
  // Send the waiting changes in order. Offline: stop and keep them. Refused by the server: drop it and say so.
  let flushing = null;
  function flush() {
    if (!shared || !outbox.length) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (async () => {
      while (outbox.length) {
        const op = outbox[0];
        try {
          if (op.del) await api(`mesures?id=eq.${op.del}`, { method: "DELETE" });
          else {
            const { _pending, ...row } = op.row;
            await api("mesures?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]) });
          }
        } catch (e) {
          if (!e.http) break; // no network: try again later
          error = "Une mesure n'a pas pu être enregistrée (refusée par le serveur).";
        }
        outbox.shift(); write(OUTBOX, outbox);
      }
    })().finally(() => { flushing = null; emit(); });
    return flushing;
  }
  window.addEventListener("online", () => flush().then(load));

  window.Growth = {
    lms, atZ, zScore, phi, pctText, CURVES, nf, DAY_MS, MIN_GAP, tsOf, weights, gainOf,
    rows, load, save, remove, flush, onChange: (fn) => listeners.push(fn), shared,
    get error() { return error; }, get waiting() { return outbox.length; }
  };
})();
