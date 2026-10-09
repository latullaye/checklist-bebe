// THOMAS911 health reminders and the Family calendar (Web Push). Called by pg_cron every 5 minutes (x-cron-key header).
// - Medications: a reminder when a dose is due (every N hours, or at set times), again 30 min later if it's still not given.
// - Appointments: the day before at 19:00 (phone's time) and one hour before.
// - While a problem lasts: at 20:00 (phone's time), if nothing was noted that day, a nudge to note how Thomas is.
// - Every hour: reads the Family calendar (its secret iCal address is in prive), keeps the health-looking events in "agenda"
//   for the phones to sort ("for Thomas" or "ignore"), and moves the appointments taken from it when the event moves.
// Body {"agenda": true} reads the calendar now; {"dry": true} sends nothing and says what it would send ({"now": ISO} to try a time).
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";
import { H, DEFAULT_TZ, partsIn, addDays, fmtTime, nextDue, parseICS, isHealth, guessTz, type Med, type Dose } from "./logic.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
const SITE = "https://latullaye.github.io/checklist-bebe/";
const WINDOW = 10 * 6e4; // a reminder is due during the 10 minutes after its time (two 5-minute ticks)
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const setting = async (cle: string) => (await sql`select valeur from prive where cle = ${cle}`)[0]?.valeur as string | undefined;
const inWindow = (now: number, at: number) => now >= at && now < at + WINDOW;

type Msg = { kind: string; title: string; body: string; tz?: string; [k: string]: unknown };

// ---------- Family calendar ----------
async function syncAgenda() {
  const url = await setting("agenda_ical");
  if (!url) return { agenda: "pas d'adresse" };
  const r = await fetch(url);
  if (!r.ok) return { agenda: `erreur ${r.status}` };
  const from = Date.parse("2026-06-01T00:00:00Z"), to = Date.now() + 400 * 864e5, seen = new Date().toISOString();
  const evs = parseICS(await r.text()).filter((e) => e.debut >= from && e.debut <= to && !e.recurring && !e.cancelled && isHealth(e));
  for (const e of evs) {
    await sql`insert into agenda (uid, debut, fin, journee, titre, lieu, fuseau, vu)
      values (${e.uid}, ${new Date(e.debut).toISOString()}, ${e.fin ? new Date(e.fin).toISOString() : null}, ${e.journee}, ${e.titre}, ${e.lieu}, ${guessTz(e)}, ${seen})
      on conflict (uid) do update set debut = excluded.debut, fin = excluded.fin, journee = excluded.journee, titre = excluded.titre,
        lieu = excluded.lieu, fuseau = excluded.fuseau, vu = excluded.vu`;
  }
  // Gone from the calendar (deleted, cancelled, no longer health-looking): forget it unless it was sorted
  await sql`delete from agenda where decision is null and vu < ${seen}`;
  // An appointment taken from the calendar follows its event when it moves (not the past ones)
  const moved = await sql`update sante_rdv r set le = a.debut, maj = now() from agenda a
    where r.agenda_uid = a.uid and r.le <> a.debut and a.debut > now() - interval '1 day' returning r.id`;
  // An appointment typed in the app and then put in the calendar ("Add to calendar"): link them instead of offering it again
  const linked = await sql`update sante_rdv r set agenda_uid = a.uid from agenda a
    where r.agenda_uid is null and a.decision is null and abs(extract(epoch from (r.le - a.debut))) < 600 returning a.uid`;
  if (linked.length) await sql`update agenda set decision = 'ajoute' where uid in ${sql(linked.map((x) => x.uid))}`;
  return { agenda: evs.length, deplaces: moved.length, relies: linked.length };
}

// ---------- What to send ----------
async function messages(now: number, zones: string[]) {
  const out: [string, Msg][] = []; // [key that marks it sent, message]
  // Medications: due now (or 30 min ago and still not given)
  // (dates and times as ISO text, as on the phones)
  const meds = await sql`select id, nom, dose, mode, toutes_h, heures, to_json(debut) #>> '{}' as debut, fin::text as fin, to_json(arrete) #>> '{}' as arrete, fuseau from sante_medicaments
    where rappels and mode <> 'besoin' and arrete is null and (fin is null or fin >= current_date - 1)` as unknown as Med[];
  for (const m of meds) {
    const doses = await sql`select medicament, to_json(le) #>> '{}' as le from sante_prises where medicament = ${m.id} order by le` as unknown as Dose[];
    const at = nextDue(m, doses, now);
    if (at == null) continue;
    const when = fmtTime(at, m.fuseau || DEFAULT_TZ), base = { kind: "prise", med: m.id, at: new Date(at).toISOString() };
    if (inWindow(now, at)) out.push([`prise|${m.id}|${at}`, { ...base, title: m.nom, body: `${m.dose ? `${m.dose} · ` : ""}prise de ${when}` }]);
    else if (inWindow(now, at + 30 * 6e4)) out.push([`prise2|${m.id}|${at}`, { ...base, title: m.nom, body: `Prise de ${when} pas encore notée${m.dose ? ` (${m.dose})` : ""}` }]);
  }
  // Appointments: one hour before (for everyone), the day before at 19:00 (on each phone's clock)
  const rdvs = await sql`select id, to_json(le) #>> '{}' as le, fuseau, type, lieu, pro, motif from sante_rdv where not annule and le > now() and le < now() + interval '2 days'`;
  const label = (r: Record<string, string>) => r.motif || r.pro || r.lieu || "Rendez-vous";
  const where = (r: Record<string, string>) => [r.lieu, r.pro].filter(Boolean).join(" · ");
  for (const r of rdvs) {
    const t = Date.parse(r.le), tz = r.fuseau || DEFAULT_TZ;
    if (inWindow(now, t - H)) out.push([`rdv1h|${r.id}`, { kind: "rdv", rdv: r.id, title: `Dans 1 h : ${label(r)}`, body: [fmtTime(t, tz), where(r)].filter(Boolean).join(" · ") }]);
    for (const z of zones) {
      const today = partsIn(now, z).day;
      if (partsIn(t, z).day === addDays(today, 1) && partsIn(now, z).time >= "19:00" && partsIn(now, z).time < "19:10")
        out.push([`rdvveille|${r.id}|${z}`, { kind: "rdv", rdv: r.id, tz: z, title: `Demain : ${label(r)}`, body: [`à ${fmtTime(t, tz)}`, where(r)].filter(Boolean).join(" · ") }]);
    }
  }
  // While a problem lasts: at 20:00, note the day if nothing was noted
  const open = await sql`select id, titre, diagnostic, debut::text as debut from sante_problemes where fin is null`;
  for (const z of zones) {
    const { day, time } = partsIn(now, z);
    if (time < "20:00" || time >= "20:10") continue;
    for (const p of open) {
      const noted = await sql`select 1 from sante_notes where probleme = ${p.id} and jour = ${day} limit 1`;
      if (noted.length) continue;
      const n = Math.round((Date.parse(day) - Date.parse(p.debut)) / 864e5) + 1;
      out.push([`note|${p.id}|${day}|${z}`, { kind: "note", probleme: p.id, tz: z, title: "Comment va Thomas ce soir ?",
        body: `${p.diagnostic || p.titre}, jour ${n} : note en quelques mots ce que tu as vu aujourd'hui.` }]);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const token = await setting("cron");
  if (!token || req.headers.get("x-cron-key") !== token) return json({ erreur: "non autorisé" }, 401);
  const body = await req.json().catch(() => ({}));
  const now = body.dry && body.now ? Date.parse(body.now) : Date.now();
  const report: Record<string, unknown> = {};

  // The calendar, once an hour (or when asked)
  if (body.agenda || new Date(now).getUTCMinutes() < 5) {
    try { Object.assign(report, await syncAgenda()); } catch (e) { report.agenda = `erreur ${(e as Error).message}`.slice(0, 200); }
  }
  const subs = await sql`select endpoint, abonnement, tz from abonnements`;
  const zones = [...new Set(subs.map((s) => s.tz || DEFAULT_TZ))];
  const todo = await messages(now, zones);
  if (body.dry) return json({ ...report, aEnvoyer: todo.map(([k, m]) => ({ cle: k, ...m })) });

  const { pub, priv } = { pub: await setting("vapid_public"), priv: await setting("vapid_private") };
  if (!pub || !priv) return json({ ...report, erreur: "clés VAPID manquantes" });
  webpush.setVapidDetails(SITE, pub, priv);
  const sent: string[] = [], errors: string[] = [];
  for (const [key, msg] of todo) {
    // Each reminder once: the key is kept for two weeks
    const fresh = await sql`insert into rappels_envoyes (cle) values (${key}) on conflict do nothing returning cle`;
    if (!fresh.length) continue;
    const to = subs.filter((s) => !msg.tz || (s.tz || DEFAULT_TZ) === msg.tz);
    for (const s of to) {
      try { await webpush.sendNotification(s.abonnement, JSON.stringify(msg), { TTL: 2 * 3600, urgency: "high" }); }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql`delete from abonnements where endpoint = ${s.endpoint}`;
        else errors.push(`${code ?? ""} ${(e as Error).message}`.slice(0, 200));
      }
    }
    sent.push(key);
  }
  if (new Date(now).getUTCMinutes() < 5) await sql`delete from rappels_envoyes where le < now() - interval '14 days'`;
  return json({ ...report, envoyes: sent, erreurs: errors });
});
