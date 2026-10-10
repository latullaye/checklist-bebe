// Pure helpers of the "sante" function (no database, no network), tested on their own.
export const H = 36e5;
export const DEFAULT_TZ = "America/Toronto";

// Instant -> wall clock in a time zone (an unknown zone falls back to the family's)
export function partsIn(t: number, tz: string) {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    return partsIn(t, DEFAULT_TZ);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
// Wall clock in a time zone -> instant
export function instant(day: string, time: string, tz: string) {
  const wall = Date.parse(`${day}T${time}:00Z`);
  const offset = (t: number) => { const p = partsIn(t, tz); return Date.parse(`${p.day}T${p.time}:00Z`) - t; };
  const t = wall - offset(wall);
  return wall - offset(t); // second pass, right around a daylight-saving change
}
export const addDays = (day: string, n: number) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtTime = (t: number, tz: string) => { const { time } = partsIn(t, tz); const [h, m] = time.split(":"); return `${Number(h)} h${m === "00" ? "" : ` ${m}`}`; };

// ---------- Medications (same rules as sante.js on the phones) ----------
export type Med = { id: string; nom: string; dose: string | null; mode: string; toutes_h: number | null; heures: string[] | null; debut: string; fin: string | null; arrete: string | null; fuseau: string | null; max_jour?: number | null };
export type Dose = { medicament: string; le: string };
function slots(m: Med, from: number, to: number) {
  const tz = m.fuseau || DEFAULT_TZ, out: number[] = [];
  for (let day = partsIn(from, tz).day; day <= partsIn(to, tz).day; day = addDays(day, 1))
    (m.heures || []).forEach((hm) => { const t = instant(day, hm, tz); if (t >= from && t <= to) out.push(t); });
  return out.sort((a, b) => a - b);
}
// When the next dose is due (every N hours, or at set times); null when none (when needed, stopped, course over)
export function nextDue(m: Med, doses: Dose[], now: number): number | null {
  if (m.arrete && Date.parse(m.arrete) <= now) return null;
  const end = m.fin ? instant(addDays(m.fin, 1), "00:00", m.fuseau || DEFAULT_TZ) : Infinity;
  if (now >= end) return null;
  const ds = doses.map((d) => Date.parse(d.le)).sort((a, b) => a - b), last = ds.length ? ds[ds.length - 1] : null, start = Date.parse(m.debut);
  let at: number | null = null;
  if (m.mode === "intervalle") at = last != null ? last + Number(m.toutes_h || 24) * H : start;
  else if (m.mode === "heures") {
    const ss = slots(m, Math.max(start - 60e3, now - 36 * H), now + 72 * H);
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i], next = ss[i + 1] || s + 24 * H;
      if (ds.some((t) => t >= s - 2 * H && t < next - 2 * H) || s < now - 12 * H) continue;
      at = s; break;
    }
  }
  return at != null && at < end ? at : null;
}
// When needed: when a dose is possible again (the gap since the last one, and no more than max_jour in 24 h)
export function nextPossible(m: Med, doses: Dose[], now: number): number {
  const ds = doses.map((d) => Date.parse(d.le)).sort((a, b) => a - b), last = ds.length ? ds[ds.length - 1] : null;
  let at = last != null ? last + Number(m.toutes_h || 0) * H : now;
  const in24 = ds.filter((t) => t > now - 24 * H);
  if (m.max_jour && in24.length >= m.max_jour) at = Math.max(at, in24[in24.length - m.max_jour] + 24 * H);
  return at;
}

// ---------- Family calendar (iCal) ----------
export type Ev = { uid: string; titre: string; lieu: string | null; debut: number; fin: number | null; journee: boolean; fuseau: string | null; cancelled: boolean; recurring: boolean };
const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
function icsTime(value: string, params: Record<string, string>, calTz: string) {
  const v = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const day = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return { t: Date.parse(day + "T12:00:00Z"), allDay: true, tz: null as string | null };
  }
  const m = v.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z?)$/);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`, time = `${m[4]}:${m[5]}`;
  if (m[7] === "Z") return { t: Date.parse(`${day}T${time}:${m[6] || "00"}Z`), allDay: false, tz: null };
  let tz = params.TZID || calTz;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = DEFAULT_TZ; }
  return { t: instant(day, time, tz), allDay: false, tz };
}
export function parseICS(text: string): Ev[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const calTz = (lines.find((l) => l.startsWith("X-WR-TIMEZONE:")) || "").slice(14).trim() || DEFAULT_TZ;
  const out: Ev[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.UID && cur.DTSTART) {
        const s = icsTime(cur.DTSTART.value, cur.DTSTART.params, calTz), e = cur.DTEND ? icsTime(cur.DTEND.value, cur.DTEND.params, calTz) : null;
        if (s) out.push({ uid: cur.UID.value, titre: unescape(cur.SUMMARY ? cur.SUMMARY.value : "").trim(), lieu: cur.LOCATION ? unescape(cur.LOCATION.value).trim() || null : null,
          debut: s.t, fin: e ? e.t : null, journee: s.allDay, fuseau: s.tz, cancelled: !!cur.STATUS && cur.STATUS.value === "CANCELLED",
          recurring: !!cur.RRULE || !!cur["RECURRENCE-ID"] });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(";");
    const params = Object.fromEntries(ps.map((p) => { const j = p.indexOf("="); return [p.slice(0, j).toUpperCase(), p.slice(j + 1).replace(/^"|"$/g, "")]; }));
    if (!cur[name.toUpperCase()]) cur[name.toUpperCase()] = { value: line.slice(i + 1), params };
  }
  return out;
}
// Health-looking: a care word in the title or the place; not an appointment of a parent alone. The parents' first names
// come from the family's settings (table reglages, key "famille"), not from this public code.
const CARE = /thomas|clsc|vaccin|m[ée]decin|docteur|\bdre?\b|p[ée]diatr|ost[ée]o|fr[ée]notomie|[ée]chograph|\bgmf\b|h[ôo]pital|hospital|clinique|lactation|allaitement|urgence|info-sant|\b811\b|massoth|chiropra|consultation|rdv m[ée]dical|rendez-vous m[ée]dical/i;
const BABY = /thomas|lactation|allaitement|b[ée]b[ée]/i;
const bare = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// One of these words, whole, in the text (accents and capitals don't matter)
const hasWord = (text: string, words: string[]) => { const t = ` ${bare(text)} `; return words.map(bare).some((w) => w && t.includes(` ${w} `)); };
export const isHealth = (e: Ev, parents: string[] = []) => CARE.test(`${e.titre} ${e.lieu || ""}`) && (!hasWord(e.titre, parents) || BABY.test(e.titre));
// Most events are stored in UTC: their wall clock is home's, unless the place says France (or one of the family's places
// there, from its settings)
const FRANCE = /france|\b\d{5}\b/i;
export const guessTz = (e: Ev, places: string[] = []) =>
  e.fuseau || (FRANCE.test(`${e.lieu || ""} ${e.titre}`) || hasWord(`${e.lieu || ""} ${e.titre}`, places) ? "Europe/Paris" : DEFAULT_TZ);
