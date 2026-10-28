// The habits and their rhythm, for the reminders ("rappels") and Claude ("mcp"): same catalog and rules as habits.js on the
// phones. The family turns each one on or off and sets its rhythm in Settings (shared setting "habitudes"):
// - "jour": every day at the chosen moments: one box per moment ("bouche-matin"), or a single box when there is only one ("vitd");
// - "jours": every N days from the last time ("bain"), due from the Nth day, reminded at its moment; depuis: not before that many
//   days of age (the date of birth is in the family's settings).
export type Habit = {
  id: string; nom: string; court: string; rythme: "jour" | "jours"; moments: string[]; tous: number; moment: string;
  depuis?: number; actif: boolean;
};
export const SLOTS = ["matin", "midi", "soir"];
const ORDER: Record<string, number> = { matin: 0, midi: 1, soir: 2 };
export const EVERY_MIN = 2, EVERY_MAX = 30;
type Base = Omit<Habit, "actif" | "moments" | "tous" | "moment"> & { moments?: string[]; tous?: number; moment?: string };
export const CATALOG: Base[] = [
  { id: "bouche", nom: "Exercices de bouche", court: "Bouche", rythme: "jour", moments: ["matin", "midi", "soir"] },
  { id: "perinee", nom: "Rééducation périnéenne", court: "Rééducation", rythme: "jour", moments: ["matin", "midi", "soir"] },
  { id: "vitd", nom: "Vitamine D", court: "Vitamine D", rythme: "jour", moments: ["matin"] },
  { id: "bain", nom: "Bain", court: "Bain", rythme: "jours", tous: 2, moment: "soir" },
  { id: "ongles", nom: "Couper les ongles", court: "Ongles", rythme: "jours", tous: 10, moment: "soir", depuis: 42 }
];
// Every key a habit can have (its single box, or one per moment)
export const KEYS = CATALOG.flatMap((h) => [h.id, ...SLOTS.map((s) => `${h.id}-${s}`)]);

// The habits as the family set them (anything missing or odd falls back to the catalog; the nails' rhythm used to be its own
// setting, "ongles_jours")
export function habits(saved: unknown, legacyNails?: unknown): Habit[] {
  const all = saved && typeof saved === "object" ? saved as Record<string, any> : {};
  return CATALOG.map((base) => {
    const v = all[base.id] && typeof all[base.id] === "object" ? all[base.id] : {};
    const rythme = v.rythme === "jour" || v.rythme === "jours" ? v.rythme : base.rythme;
    const moments = Array.isArray(v.moments) ? SLOTS.filter((s) => v.moments.includes(s)) : [];
    const n = Math.round(Number(v.tous ?? (base.id === "ongles" ? legacyNails : undefined)));
    return { ...base, actif: v.actif !== false, rythme,
      moments: moments.length ? moments : base.moments || [base.moment || "matin"],
      tous: n >= EVERY_MIN && n <= EVERY_MAX ? n : base.tous || 7,
      moment: ORDER[v.moment] != null ? v.moment : base.moment || (base.moments || ["matin"]).at(-1)! };
  });
}
export const byKey = (list: Habit[], k: string) => list.find((h) => h.id === k.split("-")[0]) || null;
export const boxes = (h: Habit) => (h.rythme === "jour" && h.moments.length > 1 ? h.moments.map((m) => `${h.id}-${m}`) : [h.id]);
export const boxAt = (h: Habit, slot: string) => (h.rythme !== "jour" ? null
  : h.moments.length > 1 ? (h.moments.includes(slot) ? `${h.id}-${slot}` : null) : h.moments[0] === slot ? h.id : null);
const momentOf = (h: Habit) => (h.rythme === "jour" ? h.moments[0] : h.moment);
// "Exercices de bouche (matin)", "Vitamine D"
export const label = (list: Habit[], k: string) => {
  const h = byKey(list, k), m = k.split("-")[1];
  return `${h ? h.nom : k}${m ? ` (${m})` : ""}`;
};

const addDays = (day: string, n: number) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const isDay = (s?: string | null) => !!s && /^\d{4}-\d\d-\d\d$/.test(s);
// From when (age), whether it has started, whether it is due (from the Nth day after the last time), late (past it)
export const start = (h: Habit, birth?: string | null) => (!h.depuis ? null : isDay(birth) ? addDays(birth!, h.depuis) : "9999-12-31");
export const started = (h: Habit, day: string, birth?: string | null) => !h.depuis || day >= start(h, birth)!;
export const due = (h: Habit, day: string, ago: number | null, birth?: string | null) =>
  h.rythme === "jours" && started(h, day, birth) && (ago === null || ago >= h.tous);

// What this moment is about (the app's "À faire" and the red badge): the slot's boxes; the once-a-day box and the every-N-days
// ones on their day, from their moment on
export function todo(list: Habit[], slot: string, day: string, ago: (id: string) => number | null, birth?: string | null) {
  return list.filter((h) => h.actif).flatMap((h) => {
    if (h.rythme === "jour" && h.moments.length > 1) return h.moments.includes(slot) ? [`${h.id}-${slot}`] : [];
    if (ORDER[slot] < ORDER[momentOf(h)]) return [];
    return h.rythme === "jour" || due(h, day, ago(h.id), birth) ? [h.id] : [];
  });
}

// How a reminder says it
const SAY: Record<string, { faire: string; seul?: string; jour: (h: Habit) => string; depuis: (n: number) => string }> = {
  bouche: { faire: "faire les exercices de bouche", jour: () => "le jour des exercices de bouche", depuis: (n) => `les derniers remontent à ${n} jours` },
  perinee: { faire: "faire la rééducation périnéenne", jour: () => "le jour de la rééducation périnéenne", depuis: (n) => `la dernière remonte à ${n} jours` },
  vitd: { faire: "donner la vitamine D", seul: "Thomas doit prendre sa vitamine D.", jour: () => "le jour de la vitamine D", depuis: (n) => `la dernière remonte à ${n} jours` },
  bain: { faire: "donner le bain", jour: (h) => (h.moment === "soir" ? "le soir du bain" : "le jour du bain"), depuis: (n) => `le dernier remonte à ${n} jours` },
  ongles: { faire: "couper les ongles", jour: () => "le jour des ongles", depuis: (n) => `coupés il y a ${n} jours` }
};
const and = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} et ${l.at(-1)}` : l[0] || "");

// The reminder of a moment: the boxes of that moment not done yet, then the every-N-days ones due at that moment.
// "Il faut faire les exercices de bouche et la rééducation périnéenne. Thomas doit prendre sa vitamine D. Et c'est le soir du
// bain (le dernier remonte à 3 jours)." cles: what "C'est fait" ticks (the boxes; else the first every-N-days one); reste: the
// red badge, like the app's "À faire". null: nothing left.
export function reminder(list: Habit[], slot: string, day: string, done: Set<string>, ago: (id: string) => number | null, birth?: string | null) {
  const on = list.filter((h) => h.actif);
  const boxed = on.map((h) => [h, boxAt(h, slot)] as const).filter(([, k]) => k && !done.has(k)) as [Habit, string][];
  const some = on.filter((h) => h.rythme === "jours" && h.moment === slot && !done.has(h.id) && due(h, day, ago(h.id), birth));
  if (!boxed.length && !some.length) return null;
  const faire = boxed.filter(([h]) => !SAY[h.id]?.seul).map(([h]) => SAY[h.id]?.faire || `faire « ${h.nom} »`);
  // "faire A et faire B" -> "faire A et B"
  const words = faire.map((f, i) => (i && faire[0].startsWith("faire ") && f.startsWith("faire ") ? f.slice(6) : f));
  const body = [
    words.length ? `Il faut ${and(words)}.` : "",
    ...boxed.map(([h]) => SAY[h.id]?.seul || ""),
    ...some.map((h, i) => {
      const a = ago(h.id), say = SAY[h.id];
      return `${i ? "C'est aussi" : boxed.length ? "Et c'est" : "C'est"} ${say ? say.jour(h) : `le jour de « ${h.nom} »`}${a && say ? ` (${say.depuis(a)})` : ""}.`;
    })
  ].filter(Boolean).join(" ");
  return {
    body,
    cles: boxed.length ? boxed.map(([, k]) => k) : [some[0].id],
    reste: todo(list, slot, day, ago, birth).filter((k) => !done.has(k)).length
  };
}
