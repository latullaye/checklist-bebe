// THOMAS911 habit reminders (Web Push).
// - GET  ?cle-publique      -> the VAPID public key (created on first call; the private half never leaves the database)
// - POST (x-cron-key header) -> called by pg_cron every half hour; each phone gets its reminder at 9:00, 12:30 and 17:30
//   in its own time zone (abonnements.tz). Body {"slot": "matin"} forces a moment, {"dry": true} sends nothing.
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

// What's left for this moment of that day, in this order. Vitamin D only in the morning.
async function message(jour: string, slot: string) {
  const rows = await sql`select cle from habitudes where jour = ${jour} and fait`;
  const done = new Set(rows.map((r) => r.cle));
  const todo = [
    [`bouche-${slot}`, "il faut faire les exercices de bouche de Thomas"],
    [`perinee-${slot}`, "Edith doit faire sa rééducation périnéenne"],
    ...(slot === "matin" ? [["vitd", "Thomas doit prendre sa vitamine D"]] : [])
  ].filter(([cle]) => !done.has(cle));
  if (!todo.length) return null;
  const phrases = todo.map(([, t]) => t);
  const sentence = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} et ${phrases.at(-1)}` : phrases[0];
  return { title: `Rappel du ${slot}`, body: sentence[0].toUpperCase() + sentence.slice(1) + ".", jour, slot, cles: todo.map(([c]) => c) };
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
    if (!msg || body.dry) { report.push({ tz, jour, slot, abonnes: group.length, envoye: 0, message: msg?.body ?? "tout est fait" }); continue; }
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
