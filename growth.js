// Growth measures, shared by the growth screen and the home page (needs who-boys.js and thomas.js).
// - WHO 2006 percentiles (boys): LMS tables, z-scores, percentile labels; usual gain for the age; trends over a few days.
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
      const t = tsOf(r), age = Thomas.known ? Thomas.daysBetween(Thomas.BIRTH_DAY, r.jour) : null, v = r.poids_g / 1000;
      return { row: r, day: r.jour, t, age, ageF: Thomas.known ? (t - Thomas.BIRTH) / DAY_MS : null, v, z: age == null ? null : zScore("wfa", age, v) };
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

  // ---------- Usual weight gain for the age (WHO 2009 weight velocity standards, boys) ----------
  // 1-month increments in grams: [interval start, end (days), L, M, S], Box-Cox with a +400 g shift:
  // z = (((g + 400) / M)^L − 1) / (L·S). Months are 30.4375 days; the first interval is 0–4 weeks.
  const VEL = [[0, 28, 1.3828, 1423.0783, 0.22048], [28, 60.875, 0.7241, 1596.347, 0.19296], [60.875, 91.3125, 0.659, 1215.3989, 0.19591],
    [91.3125, 121.75, 0.7003, 1017.0488, 0.20965], [121.75, 152.1875, 0.7419, 921.6249, 0.2279], [152.1875, 182.625, 0.7668, 822.1842, 0.24854],
    [182.625, 213.0625, 0.7688, 756.5306, 0.26783], [213.0625, 243.5, 0.7624, 715.6257, 0.28677], [243.5, 273.9375, 0.762, 684.7459, 0.30439],
    [273.9375, 304.375, 0.7659, 658.5809, 0.32154], [304.375, 334.8125, 0.7713, 643.4374, 0.33882], [334.8125, 365.25, 0.7761, 639.4743, 0.35502]];
  const DELTA = 400;
  const velZ = ([a, b, L, M, S], gday) => { const g = gday * (b - a) + DELTA; return g <= 0 ? -5 : (Math.pow(g / M, L) - 1) / (L * S); };
  const velG = ([a, b, L, M, S], z) => { const base = 1 + L * S * z; return base <= 0 ? -DELTA / (b - a) : (M * Math.pow(base, 1 / L) - DELTA) / (b - a); };
  // Between two weighings (ages in days): where the gain stands. Uses the age halfway, blending the two
  // nearest monthly intervals. Not for the first week, when babies lose weight then get it back (by about 10–14 days).
  function velocity(fromAge, toAge, gday) {
    const mid = (fromAge + toAge) / 2;
    if (mid < 8 || mid > 365) return null;
    const mids = VEL.map(([a, b]) => (a + b) / 2);
    let i = mids.findIndex((m) => m > mid) - 1;
    if (i < 0) i = mid <= mids[0] ? 0 : VEL.length - 1;
    const j = Math.min(VEL.length - 1, i + 1), w = j === i ? 0 : Math.max(0, Math.min(1, (mid - mids[i]) / (mids[j] - mids[i])));
    const mix = (f, x) => (1 - w) * f(VEL[i], x) + w * f(VEL[j], x);
    const z = mix(velZ, gday);
    return { z, lo: mix(velG, -1.036), hi: mix(velG, 1.036), med: mix(velG, 0), lo5: mix(velG, -1.645), hi95: mix(velG, 1.645),
      short: toAge - fromAge < 4 }; // over a few days the scale's precision weighs a lot
  }
  // ---------- Trend: average gain per 24 h over the last few days ----------
  // Weighings come at any hour and any interval (every day at home, every few weeks at the CLSC). Over each period
  // ending at the last weighing, the trend is the slope of the straight line closest to all its weighings (least squares,
  // times to the minute): a weighing a bit high or low (feed, diaper) weighs less than in a plain difference of two.
  const WINDOWS = [3, 5, 7, 10, 14, 30];
  const TOL = 0.25; // never the same hour: up to 6 h more still counts as "N days ago"
  function slope(pts) { // grams per day
    const n = pts.length, tm = pts.reduce((a, p) => a + p.t, 0) / n, vm = pts.reduce((a, p) => a + p.v, 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { const dt = (p.t - tm) / DAY_MS; num += dt * (p.v - vm) * 1000; den += dt * dt; }
    return den ? num / den : null;
  }
  function trend(pts, days) {
    const last = pts.at(-1); if (!last) return null;
    const ago = (p) => (last.t - p.t) / DAY_MS;
    const win = pts.filter((p) => ago(p) <= days + TOL);
    // No weighing near the start of the period: take the one just before, unless it's much further back
    if (ago(win[0]) < days - Math.max(TOL, days * 0.15)) {
      const before = pts.filter((p) => ago(p) > days + TOL).at(-1);
      if (before && ago(before) <= days * 1.5 + TOL) win.unshift(before);
    }
    const span = ago(win[0]);
    if (win.length < 2 || span < Math.max(1, days / 3)) return null;
    const g = slope(win), known = new Set(win.map((p) => p.row.lieu).filter(Boolean));
    // nominal: the weighings do cover about that many days (else say the real span)
    return { days, g, span, n: win.length, from: win[0], to: last, mixed: known.size > 1, vel: velocity(win[0].ageF, last.ageF, g),
      nominal: Math.abs(span - days) <= Math.max(0.5, days * 0.15) };
  }
  // Every period, without repeating one that rests on the same weighings as the shorter one before it
  function trends(pts) {
    const out = [];
    for (const d of WINDOWS) { const t = trend(pts, d); if (t && !(out.length && out.at(-1).from === t.from)) out.push(t); }
    return out;
  }
  // The one to read first: a week, or the nearest period there is
  const headline = (list) => list.find((t) => t.days === 7) || list.find((t) => t.days > 7) || list.at(-1) || null;

  // ---------- Where it was taken (scales differ a little) ----------
  const LIEUX = [["clsc", "CLSC", "au CLSC"], ["medecin", "Médecin", "chez le médecin"], ["maison", "Maison", "à la maison"]];
  const lieuName = (l, phrase) => (LIEUX.find(([k]) => k === l) || [])[phrase ? 2 : 1] || "";

  // Plain words for where the gain stands
  const velWords = (z) => z < -1.645 ? "en dessous de l'habituel" : z < -1.036 ? "un peu en dessous de l'habituel"
    : z <= 1.036 ? "dans la fourchette habituelle" : z <= 1.645 ? "un peu au-dessus de l'habituel" : "au-dessus de l'habituel";
  const velLevel = (z) => Math.abs(z) <= 1.036 ? "ok" : Math.abs(z) <= 1.645 ? "near" : "out";

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
    return flush().then(() => api("mesures?select=id,jour,pese_le,fuseau,lieu,poids_g,taille_cm,pc_cm,note&order=pese_le.asc,cree.asc"))
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
    lms, atZ, zScore, phi, pctText, CURVES, nf, DAY_MS, MIN_GAP, tsOf, weights, gainOf, velocity, velWords, velLevel,
    WINDOWS, trend, trends, headline, LIEUX, lieuName,
    rows, load, save, remove, flush, onChange: (fn) => listeners.push(fn), shared,
    get error() { return error; }, get waiting() { return outbox.length; }
  };
})();
