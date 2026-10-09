// Health, shared by the health screen and the home page (needs config.js, famille.js, thomas.js).
// - Problems: they start as what is seen ("Diarrhée") and get a diagnosis later ("Gastro-entérite").
// - Notes, day by day: symptoms (with counts since the note before), temperature, wet diapers, what is seen, what is done.
// - Medical appointments, past or to come, linked to problems; events found in the Family calendar (table agenda).
// - Medications as prescribed, and each dose given.
// Shared between both phones (tables sante_*). The phone keeps a copy; changes go through one ordered outbox, so a note
// written offline right after its new problem reaches the server after it.
(function () {
  const cfg = self.T911 || {};
  const shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  const TABLES = {
    problemes: { path: "sante_problemes", order: "debut.desc" },
    notes: { path: "sante_notes", order: "le.asc" },
    rdv: { path: "sante_rdv", order: "le.asc" },
    medicaments: { path: "sante_medicaments", order: "debut.asc" },
    prises: { path: "sante_prises", order: "le.asc" },
    agenda: { path: "agenda", order: "debut.asc", key: "uid", filter: "&decision=is.null" } // only the ones not sorted yet
  };
  const CACHE = "thomas911-sante", OUTBOX = "thomas911-sante-attente";
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let server = read(CACHE, {}), outbox = read(OUTBOX, []), error = "", loaded = false;
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) {} });
  const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
  }).then(async (r) => { if (!r.ok) { const e = new Error(await r.text() || r.status); e.http = r.status; throw e; } return r; });
  const uuid = () => (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
  const keyOf = (t) => TABLES[t].key || "id";

  // What the screens show: the server copy with the waiting changes on top (marked _pending)
  function rows(t) {
    const k = keyOf(t), out = new Map((server[t] || []).map((r) => [r[k], r]));
    outbox.forEach((op) => {
      if (op.t !== t) return;
      if (op.del) out.delete(op.del);
      else out.set(op.row[k], { ...(out.get(op.row[k]) || {}), ...op.row, _pending: true });
    });
    return [...out.values()];
  }
  const byId = (t, id) => rows(t).find((r) => r[keyOf(t)] === id) || null;
  function load() {
    if (!shared) return Promise.resolve();
    return flush().then(() => Promise.all(Object.entries(TABLES).map(([t, { path, order, filter }]) =>
      api(`${path}?select=*&order=${order}${filter || ""}`).then((r) => r.json()).then((data) => [t, data]))))
      .then((all) => { server = Object.fromEntries(all); loaded = true; write(CACHE, server); emit(); })
      .catch(() => {});
  }
  function queue(op) { outbox.push(op); write(OUTBOX, outbox); error = ""; emit(); flush().then(() => outbox.length || load()); }
  // Who did it (famille.js) and when it changed are filled in here
  function save(t, row) {
    const k = keyOf(t), full = { ...row };
    if (t !== "agenda") {
      if (!full.id) full.id = uuid();
      if (!full.par && window.Famille) full.par = Famille.qui() || null;
      if (["problemes", "rdv", "medicaments"].includes(t)) full.maj = new Date().toISOString();
    }
    queue({ t, row: full });
    return full[k];
  }
  const remove = (t, id) => queue({ t, del: id });
  // Send the waiting changes in order. Offline: stop and keep them. Refused by the server: drop it and say so.
  let flushing = null;
  function flush() {
    if (!shared || !outbox.length) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (async () => {
      while (outbox.length) {
        const op = outbox[0], { path } = TABLES[op.t], k = keyOf(op.t);
        try {
          if (op.del) await api(`${path}?${k}=eq.${encodeURIComponent(op.del)}`, { method: "DELETE" });
          else if (op.t === "agenda") await api(`${path}?uid=eq.${encodeURIComponent(op.row.uid)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ decision: op.row.decision }) });
          else {
            const { _pending, ...row } = op.row;
            await api(`${path}?on_conflict=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]) });
          }
        } catch (e) {
          if (!e.http) break; // no network (or no family code yet): try again later
          error = "Un changement n'a pas pu être enregistré (refusé par le serveur).";
        }
        outbox.shift(); write(OUTBOX, outbox);
      }
    })().finally(() => { flushing = null; emit(); });
    return flushing;
  }
  window.addEventListener("online", () => flush().then(load));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });

  // ---------- Dates and times ----------
  const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
  const H = 36e5, DAY = 864e5;
  function partsIn(t, tz) { // instant -> { day: "YYYY-MM-DD", time: "HH:MM" } on the wall clock of tz
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || HERE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  }
  function instant(day, time, tz) { // wall clock in tz -> ms
    const wall = Date.parse(`${day}T${time}:00Z`);
    const offset = (t) => { const p = partsIn(t, tz); return Date.parse(`${p.day}T${p.time}:00Z`) - t; };
    let t = wall - offset(wall);
    return wall - offset(t); // second pass, right around a daylight-saving change
  }
  const today = () => partsIn(Date.now()).day;
  const dayOf = (t, tz) => partsIn(t, tz).day;
  const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
  const fmtDay = (day, opts = {}) => new Date(day + "T12:00:00Z").toLocaleDateString("fr-CA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", ...opts });
  const fmtTime = (t, tz) => new Date(t).toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit", timeZone: tz || HERE }).replace(/ h 00$/, " h"); // "20 h", "14 h 10"
  // "aujourd'hui", "hier", "demain", or "jeu. 8 oct."
  function relDay(day) {
    const d = daysBetween(today(), day);
    return d === 0 ? "aujourd'hui" : d === -1 ? "hier" : d === 1 ? "demain" : d === -2 ? "avant-hier" : fmtDay(day);
  }
  // "il y a 2 h 10", "dans 35 min"
  function ago(ms) {
    const m = Math.round(Math.abs(ms) / 6e4), h = Math.floor(m / 60), r = m % 60;
    return h ? `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}` : `${m} min`;
  }
  const nf = (n, d = 0) => Number(n).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- Symptoms ----------
  // [key, label, what the count counts]
  const SYMPTOMES = [
    ["diarrhee", "Diarrhée", "selles liquides"], ["vomissements", "Vomissements", "fois"], ["fievre", "Fièvre"],
    ["boit_moins", "Boit moins"], ["regurgitations", "Régurgite plus"], ["pleurs", "Pleurs, irritable"],
    ["endormi", "Très endormi, mou"], ["toux", "Toux"], ["nez", "Nez qui coule ou bouché"], ["respiration", "Respire vite ou mal"],
    ["boutons", "Boutons, rougeurs"], ["fesses", "Fesses rouges"], ["constipation", "Constipation"], ["coliques", "Coliques, gaz"],
    ["yeux", "Yeux qui collent"], ["bouche", "Bouche (muguet)"]
  ];
  const SYM = Object.fromEntries(SYMPTOMES.map(([k, label, unit]) => [k, { label, unit }]));
  const symLabel = (k) => (SYM[k] ? SYM[k].label : k); // anything else is a word typed by the parents
  // Words typed before, most used first, to offer them again
  function customWords() {
    const n = {};
    rows("notes").forEach((note) => (note.symptomes || []).forEach(({ k }) => { if (!SYM[k]) n[k] = (n[k] || 0) + 1; }));
    return Object.keys(n).sort((a, b) => n[b] - n[a]);
  }

  // ---------- Problems ----------
  const nameOf = (p) => p.diagnostic || p.titre;
  const isOpen = (p) => !p.fin;
  const problems = () => rows("problemes").sort((a, b) => (isOpen(b) - isOpen(a)) || b.debut.localeCompare(a.debut));
  const openProblems = () => problems().filter(isOpen);
  const dayNumber = (p, day = today()) => daysBetween(p.debut, day) + 1; // "jour 3"
  const notesOf = (id) => rows("notes").filter((n) => n.probleme === id).sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
  const medsOf = (id) => rows("medicaments").filter((m) => m.probleme === id);
  const rdvOf = (id) => rows("rdv").filter((r) => (r.problemes || []).includes(id)).sort((a, b) => Date.parse(a.le) - Date.parse(b.le));

  // Day by day, from the first day to the last (or today): what was seen, given and decided
  function journal(p) {
    const end = p.fin || today(), first = p.debut, out = [];
    const notes = notesOf(p.id), meds = medsOf(p.id), rdvs = rdvOf(p.id);
    const doses = rows("prises").filter((d) => meds.some((m) => m.id === d.medicament));
    for (let day = first; day <= end; day = addDays(day, 1)) {
      const ns = notes.filter((n) => n.jour === day), sym = new Map();
      ns.forEach((n) => (n.symptomes || []).forEach(({ k, n: c }) => sym.set(k, (sym.get(k) || 0) + (Number(c) || 0))));
      const temps = ns.map((n) => n.temperature).filter((t) => t != null).map(Number);
      const couches = ns.filter((n) => n.couches != null);
      const given = meds.map((m) => ({ med: m, at: doses.filter((d) => d.medicament === m.id && dayOf(d.le, d.fuseau) === day).map((d) => d) }))
        .filter((g) => g.at.length);
      out.push({ day, n: daysBetween(first, day) + 1, notes: ns, sym, tmax: temps.length ? Math.max(...temps) : null,
        couches: couches.length ? couches.reduce((s, n) => s + Number(n.couches), 0) : null, given,
        rdvs: rdvs.filter((r) => dayOf(r.le, r.fuseau) === day) });
    }
    return out;
  }
  // "Diarrhée (6 selles liquides)", "Fièvre", "Plaques sur les joues"
  const symText = (k, c) => `${symLabel(k)}${c ? ` (${c}${SYM[k] && SYM[k].unit ? ` ${SYM[k].unit}` : ""})` : ""}`;
  const quote = (s) => String(s || "").trim().replace(/\s+/g, " ");

  // What to tell the doctor, ready to read out or send
  function resume(p, extra = {}) {
    const days = journal(p), lines = [];
    const a = window.Thomas ? Thomas.age(p.fin || today()) : null;
    lines.push(`Thomas${a ? `, ${a.text.months} (${a.days} j)` : ""}${extra.poids ? `, ${extra.poids}` : ""}.`);
    const n = dayNumber(p, p.fin || today());
    lines.push(`${p.titre}${p.diagnostic && p.diagnostic !== p.titre ? ` (diagnostic : ${p.diagnostic})` : ""} depuis le ${fmtDay(p.debut, { weekday: "long" })}`
      + `${p.fin ? `, fini le ${fmtDay(p.fin, { weekday: "long" })}` : ""} : ${n} jour${n > 1 ? "s" : ""}.`);
    lines.push("");
    const low = (t) => t.replace(/^./, (c) => c.toLowerCase());
    days.forEach((d) => {
      const parts = [...d.sym].map(([k, c]) => low(symText(k, c)));
      if (d.tmax != null) parts.push(`${nf(d.tmax, 1)} °C${d.notes.filter((x) => x.temperature != null).length > 1 ? " au plus" : ""}`);
      if (d.couches != null) parts.push(`${d.couches} couche${d.couches > 1 ? "s" : ""} mouillée${d.couches > 1 ? "s" : ""}`);
      const seen = d.notes.map((x) => quote(x.observe)).filter(Boolean), done = d.notes.map((x) => quote(x.fait)).filter(Boolean);
      const meds = d.given.map(({ med, at }) => `${med.nom}${med.dose ? ` ${med.dose}` : ""} ×${at.length} (${at.map((x) => fmtTime(x.le, x.fuseau)).join(", ")})`);
      let line = `• ${fmtDay(d.day)} (jour ${d.n}) : ${parts.length ? parts.join(", ") : seen.length || done.length ? "" : "rien de noté"}`;
      if (seen.length) line += `${parts.length ? ". " : ""}${seen.join(" ")}`;
      if (done.length) line += ` Fait : ${done.join(" ")}`;
      if (meds.length) line += ` Donné : ${meds.join(" ; ")}.`;
      d.rdvs.forEach((r) => { line += ` Rendez-vous ${rdvWord(r)} à ${fmtTime(r.le, r.fuseau)}${r.diagnostic ? ` : ${r.diagnostic}` : ""}.`; });
      lines.push(line.replace(/\s+/g, " ").replace(/ \./g, ".").replace(/ : (\S)/, (m, c) => ` : ${c.toUpperCase()}`).trim());
    });
    const meds = medsOf(p.id);
    if (meds.length) { lines.push(""); meds.forEach((m) => lines.push(`Traitement : ${m.nom}${m.dose ? ` ${m.dose}` : ""}, ${posologie(m)}${m.fin ? ` jusqu'au ${fmtDay(m.fin)}` : ""}.`)); }
    return lines.join("\n").replace(/\.\./g, ".");
  }

  // ---------- Appointments ----------
  const RDV_TYPES = [["medecin", "Médecin"], ["clsc", "CLSC"], ["hopital", "Hôpital"], ["urgences", "Urgences"], ["telephone", "811, téléphone"], ["soin", "Soin (ostéo, lactation…)"], ["autre", "Autre"]];
  const SHORT = { telephone: "Téléphone", soin: "Soin" };
  const rdvType = (k, short) => (short && SHORT[k]) || (RDV_TYPES.find(([t]) => t === k) || RDV_TYPES[0])[1];
  const shortPlace = (l) => (l ? l.split("\n")[0].split(",")[0].trim() : ""); // "Hôpital général juif, 3755 Chem…" -> "Hôpital général juif"
  const rdvWord = (r) => ({ medecin: "chez le médecin", clsc: "au CLSC", hopital: "à l'hôpital", urgences: "aux urgences", telephone: "au téléphone", soin: "de soin", autre: "" })[r.type] || "";
  const rdvTitle = (r) => r.motif || r.pro || r.lieu || rdvType(r.type);
  const appointments = () => rows("rdv").sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
  const upcoming = (now = Date.now()) => appointments().filter((r) => !r.annule && Date.parse(r.le) >= now - 2 * H);
  // A calendar event becomes an appointment: guess its kind from its words
  function fromAgenda(ev) {
    const t = `${ev.titre} ${ev.lieu || ""}`.toLowerCase();
    const type = /urgence/.test(t) ? "urgences" : /clsc|vaccin/.test(t) ? "clsc" : /ost[ée]o|lactation|allaitement|physio|masso|chiro/.test(t) ? "soin"
      : /h[ôo]pital|hospital|clinique|shriners|[ée]chograph|fr[ée]notomie/.test(t) ? "hopital" : "medecin";
    return { le: ev.debut, fuseau: ev.fuseau || HERE, type, motif: ev.titre, lieu: ev.lieu || null, agenda_uid: ev.uid, problemes: [] };
  }
  // Opens Google Calendar with the appointment filled in (pick the Family calendar and save)
  function agendaLink(r) {
    const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const start = Date.parse(r.le), q = new URLSearchParams({ action: "TEMPLATE", text: `${rdvTitle(r)} (Thomas)`, dates: `${z(start)}/${z(start + H)}` });
    if (r.lieu) q.set("location", r.lieu);
    const why = [r.pro, r.motif && r.motif !== rdvTitle(r) ? r.motif : ""].filter(Boolean).join(" · ");
    if (why) q.set("details", why);
    return `https://calendar.google.com/calendar/render?${q}`;
  }

  // ---------- Medications ----------
  const meds = () => rows("medicaments").sort((a, b) => Date.parse(b.debut) - Date.parse(a.debut));
  const dosesOf = (id) => rows("prises").filter((d) => d.medicament === id).sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
  const hours = (h) => `${nf(h, h % 1 ? 1 : 0)} h`;
  const clock = (hm) => { const [h, m] = hm.split(":"); return `${Number(h)} h${m !== "00" ? ` ${m}` : ""}`; };
  function posologie(m) {
    if (m.mode === "heures") return `à ${(m.heures || []).map(clock).join(", ").replace(/, ([^,]*)$/, " et $1")}`;
    if (m.mode === "besoin") return `au besoin${m.toutes_h ? `, au moins ${hours(m.toutes_h)} entre deux prises` : ""}${m.max_jour ? `, ${m.max_jour} fois par 24 h au plus` : ""}`;
    return `toutes les ${hours(m.toutes_h || 24)}`;
  }
  const lastDayEnd = (m) => m.fin ? instant(addDays(m.fin, 1), "00:00", m.fuseau || HERE) : Infinity;
  // Taken until when: stopped, or past its last day
  function isActive(m, now = Date.now()) {
    if (m.arrete && Date.parse(m.arrete) <= now) return false;
    return now < lastDayEnd(m);
  }
  // Set times of a medication between two instants, on the clock of the phone that entered it
  function slots(m, from, to) {
    const tz = m.fuseau || HERE, out = [];
    for (let day = dayOf(from, tz); day <= dayOf(to, tz); day = addDays(day, 1))
      (m.heures || []).forEach((hm) => { const t = instant(day, hm, tz); if (t >= from && t <= to) out.push(t); });
    return out.sort((a, b) => a - b);
  }
  // The next dose: when it's due (every N hours, set times) or possible again (when needed). null: nothing to give.
  function nextDose(m, now = Date.now()) {
    if (!isActive(m, now)) return null;
    const ds = dosesOf(m.id), last = ds.length ? Date.parse(ds.at(-1).le) : null, start = Date.parse(m.debut);
    let at, kind = "due";
    if (m.mode === "intervalle") at = last != null ? last + (m.toutes_h || 24) * H : start;
    else if (m.mode === "heures") {
      // The first set time not given yet (a dose up to 2 h early counts), skipping those missed long ago
      const ss = slots(m, Math.max(start - 60e3, now - 36 * H), now + 72 * H);
      at = null;
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i], next = ss[i + 1] || s + 24 * H;
        const given = ds.some((d) => { const t = Date.parse(d.le); return t >= s - 2 * H && t < next - 2 * H; });
        if (given || s < now - 12 * H) continue;
        at = s; break;
      }
      if (at == null) return null;
    } else {
      kind = "possible";
      at = last != null ? last + (m.toutes_h || 0) * H : now;
      const in24 = ds.filter((d) => Date.parse(d.le) > now - 24 * H);
      if (m.max_jour && in24.length >= m.max_jour) at = Math.max(at, Date.parse(in24[in24.length - m.max_jour].le) + 24 * H);
    }
    if (at >= lastDayEnd(m)) return null; // the course is over
    return { at, kind, late: kind === "due" && at <= now, last: ds.at(-1) || null };
  }
  // Giving now: too early? A sentence to confirm, or "" when fine.
  function tooSoon(m, now = Date.now()) {
    const ds = dosesOf(m.id), last = ds.at(-1);
    if (m.mode === "intervalle" && last && now - Date.parse(last.le) < ((m.toutes_h || 24) - 0.5) * H)
      return `La dernière prise date de ${ago(now - Date.parse(last.le))} (prévu toutes les ${hours(m.toutes_h || 24)}).`;
    if (m.mode === "besoin") {
      const n = nextDose(m, now);
      if (n && n.at > now + 60e3) return `Prochaine prise possible à ${fmtTime(n.at)} (${posologie(m)}).`;
    }
    if (m.mode === "heures") {
      const n = nextDose(m, now);
      if (n && n.at - now > 2 * H) return `La prochaine prise est prévue à ${fmtTime(n.at, m.fuseau)}.`;
    }
    return "";
  }
  // "Jour 2 sur 5"
  function course(m, day = today()) {
    const first = dayOf(m.debut, m.fuseau), n = daysBetween(first, day) + 1;
    if (n < 1) return `commence ${relDay(first)}`;
    return m.fin ? `jour ${Math.min(n, daysBetween(first, m.fin) + 1)} sur ${daysBetween(first, m.fin) + 1}` : `jour ${n}`;
  }
  const give = (m, extra = {}) => save("prises", { medicament: m.id, le: new Date().toISOString(), fuseau: HERE, ...extra });

  load();
  window.Sante = {
    TABLES, rows, byId, load, save, remove, flush, onChange: (fn) => listeners.push(fn), shared,
    get error() { return error; }, get waiting() { return outbox.length; }, get loaded() { return loaded; },
    HERE, H, DAY, partsIn, instant, today, dayOf, addDays, daysBetween, fmtDay, fmtTime, relDay, ago, nf,
    SYMPTOMES, SYM, symLabel, symText, customWords,
    nameOf, isOpen, problems, openProblems, dayNumber, notesOf, medsOf, rdvOf, journal, resume,
    RDV_TYPES, rdvType, shortPlace, rdvWord, rdvTitle, appointments, upcoming, fromAgenda, agendaLink,
    meds, dosesOf, posologie, isActive, nextDose, tooSoon, course, give, clock, hours
  };
})();
