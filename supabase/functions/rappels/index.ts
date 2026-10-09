// THOMAS911 habit reminders (Web Push).
// - GET  ?cle-publique      -> the VAPID public key (created on first call; the private half never leaves the database)
// - POST (x-cron-key header) -> called by pg_cron every half hour; each phone gets its reminder at 9:00, 12:30 and 17:30
//   in its own time zone (abonnements.tz); the 17:30 one also says when it's bath night (every 2 or 3 days), and each one sets
//   the red badge on the app icon to what's left for that moment. Body {"slot": "matin"} forces a moment, {"dry": true} sends nothing.
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
const SITE = "https://latullaye.github.io/checklist-bebe/";
const DEFAULT_TZ = "America/Toronto";
const SLOTS: Record<string, string> = { "09:00": "matin", "12:30": "midi", "17:30": "soir" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
});
const setting = async (cle: string) => (await sql`select valeur from prive where cle = ${cle}`)[0]?.valeur as string | undefined;

async function vapid() {
  let pub = await setting("vapid_public"), priv = await setting("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await sql`insert into prive (cle, valeur) values ('vapid_public', ${k.publicKey}), ('vapid_private', ${k.privateKey}) on conflict (cle) do nothing`;
    pub = await setting("vapid_public"); priv = await setting("vapid_private");
  }
  return { pub: pub!, priv: priv! };
}

// Local date and half hour in a time zone (an unknown zone falls back to Montréal)
function local(tz: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    return local(DEFAULT_TZ);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  // pg_cron fires a few seconds after :00 / :30: round down to the half hour
  const hm = `${p.hour}:${Number(p.minute) < 30 ? "00" : "30"}`;
  return { jour: `${p.year}-${p.month}-${p.day}`, hm };
}

// The bath: every 2 or 3 days, in the evening. Due from the 2nd day after the last one (the home page says the same).
const BATH_EVERY = 2;
async function bathDue(jour: string) {
  const last = (await sql`select max(jour)::text as j from habitudes where cle = 'bain' and fait and jour <= ${jour}`)[0]?.j as string | null;
  const ago = last ? Math.round((Date.parse(jour) - Date.parse(last)) / 864e5) : null;
  return ago === null || ago >= BATH_EVERY ? { ago } : null;
}

// What's left for this moment of that day, in this order. Vitamin D only in the morning, the bath only in the evening.
async function message(jour: string, slot: string) {
  const rows = await sql`select cle from habitudes where jour = ${jour} and fait`;
  const done = new Set(rows.map((r) => r.cle));
  const todo = [
    [`bouche-${slot}`, "les exercices de bouche"],
    [`perinee-${slot}`, "la rééducation périnéenne"],
    ...(slot === "matin" ? [["vitd", ""]] : [])
  ].filter(([cle]) => !done.has(cle));
  const bath = slot === "soir" && !done.has("bain") ? await bathDue(jour) : null;
  if (!todo.length && !bath) return null;
  // "Il faut faire les exercices de bouche et la rééducation périnéenne. Thomas doit prendre sa vitamine D."
  const faire = todo.filter(([cle]) => cle !== "vitd").map(([, t]) => t);
  const body = [
    faire.length ? `Il faut faire ${faire.join(" et ")}.` : "",
    todo.some(([cle]) => cle === "vitd") ? "Thomas doit prendre sa vitamine D." : "",
    bath ? `Et c'est le soir du bain${bath.ago ? ` (le dernier remonte à ${bath.ago} jours)` : ""}.` : ""
  ].filter(Boolean).join(" ");
  // "C'est fait" ticks the exercises; it ticks the bath only when the bath is all the reminder is about
  // (the bath usually comes later in the evening than the exercises).
  const cles = todo.length ? todo.map(([c]) => c) : ["bain"];
  // The red badge on the app icon: what's left for this moment, like the home page's "À faire" (the vitamin D counts all day)
  const reste = [`bouche-${slot}`, `perinee-${slot}`, "vitd"].filter((c) => !done.has(c)).length + (bath ? 1 : 0);
  return { title: `Rappel du ${slot}`, body: todo.length ? body : body.replace("Et c'est", "C'est"), jour, slot, cles, reste };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  if (req.method === "GET" && url.searchParams.has("cle-publique")) return json({ cle: (await vapid()).pub });

  const token = await setting("cron");
  if (!token || req.headers.get("x-cron-key") !== token) return json({ erreur: "non autorisé" }, 401);
  const body = await req.json().catch(() => ({}));

  const subs = await sql`select endpoint, abonnement, tz from abonnements`;
  const { pub, priv } = await vapid();
  webpush.setVapidDetails(SITE, pub, priv);

  // Phones grouped by time zone: same local time, same message
  const zones = new Map<string, typeof subs>();
  for (const s of subs) zones.set(s.tz || DEFAULT_TZ, [...(zones.get(s.tz || DEFAULT_TZ) || []), s]);
  const report: unknown[] = [];
  for (const [tz, group] of zones) {
    const { jour, hm } = local(tz);
    const slot = body.slot || SLOTS[hm];
    if (!slot) { report.push({ tz, jour, hm, abonnes: group.length, envoye: 0 }); continue; }
    const msg = await message(jour, slot);
    if (!msg || body.dry) { report.push({ tz, jour, slot, abonnes: group.length, envoye: 0, message: msg?.body ?? "tout est fait", reste: msg?.reste ?? 0 }); continue; }
    let envoye = 0; const erreurs: string[] = [];
    for (const s of group) {
      try { await webpush.sendNotification(s.abonnement, JSON.stringify(msg), { TTL: 3 * 3600, urgency: "high" }); envoye++; }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: the phone turned reminders off or reinstalled the app
        if (code === 404 || code === 410) await sql`delete from abonnements where endpoint = ${s.endpoint}`;
        else erreurs.push(`${code ?? ""} ${(e as Error).message}`.slice(0, 200));
      }
    }
    report.push({ tz, jour, slot, abonnes: group.length, envoye, erreurs });
  }
  return json(report);
});
