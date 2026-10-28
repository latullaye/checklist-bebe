// THOMAS911 habit reminders (Web Push).
// - GET  ?cle-publique      -> the VAPID public key (created on first call; the private half never leaves the database)
// - POST (x-cron-key header) -> called by pg_cron every half hour; each phone gets its reminder at 9:00, 12:30 and 17:30
//   in its own time zone (abonnements.tz): the habits the family follows (Settings), each at its moments (the bath and the
//   nails on their day), and each one sets the red badge on the app icon to what's left for that moment (rules in
//   ../_shared/habitudes.ts). Body {"slot": "matin"} forces a moment, {"dry": true} sends nothing.
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";
import { habits, reminder, daysBetween } from "../_shared/habitudes.ts";

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

// What's left for this moment of that day (the habits followed, their rhythm and the date of birth are in the family's settings)
async function message(jour: string, slot: string) {
  const v = Object.fromEntries((await sql`select cle, valeur from reglages where cle in ('habitudes', 'ongles_jours', 'famille')`).map((r) => [r.cle, r.valeur]));
  const list = habits(v.habitudes, v.ongles_jours), birth = (v.famille?.jour as string | undefined) ?? null;
  const done = new Set((await sql`select cle from habitudes where jour = ${jour} and fait`).map((r) => r.cle as string));
  // The last time of each one, for those done every N days (30 days at most)
  const last = Object.fromEntries((await sql`select cle, max(jour)::text as j from habitudes
    where fait and jour <= ${jour}::date and jour > ${jour}::date - 60 group by cle`).map((r) => [r.cle, r.j as string]));
  const r = reminder(list, slot, jour, done, (id) => (last[id] ? daysBetween(last[id], jour) : null), birth);
  return r && { title: `Rappel du ${slot}`, body: r.body, jour, slot, cles: r.cles, reste: r.reste };
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
