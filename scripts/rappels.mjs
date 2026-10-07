// Sends the reminder to every subscribed phone, unless both boxes for this moment are already ticked.
// Run by .github/workflows/rappels.yml at 9 h, 12 h 30 and 17 h 30 (Montréal time).
import fs from "node:fs";
import vm from "node:vm";
import webpush from "web-push";

const TZ = "America/Toronto";
const ctx = { self: {} };
vm.runInNewContext(fs.readFileSync(new URL("../config.js", import.meta.url), "utf8"), ctx);
const cfg = ctx.self.T911;
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) { console.log("Partage pas configuré dans config.js : rien à envoyer."); process.exit(0); }
if (!process.env.VAPID_PRIVATE_KEY) { console.error("Secret VAPID_PRIVATE_KEY manquant."); process.exit(1); }
webpush.setVapidDetails("mailto:latullaye@gmail.com", cfg.VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);

// Local time in Montréal
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
const jour = `${parts.year}-${parts.month}-${parts.day}`;
const offset = parts.timeZoneName; // "GMT-4" in summer, "GMT-5" in winter

// GitHub cron runs in UTC and can start late, so each moment has a summer and a winter line;
// we act only on the one matching today's offset.
const CRONS = {
  "0 13 * * *": ["matin", "GMT-4"], "0 14 * * *": ["matin", "GMT-5"],
  "30 16 * * *": ["midi", "GMT-4"], "30 17 * * *": ["midi", "GMT-5"],
  "30 21 * * *": ["soir", "GMT-4"], "30 22 * * *": ["soir", "GMT-5"]
};
let slot = process.env.SLOT; // manual run
if (!slot) {
  const hit = CRONS[process.env.SCHEDULE || ""];
  if (!hit) { console.log(`Horaire inconnu : ${process.env.SCHEDULE}`); process.exit(0); }
  if (hit[1] !== offset) { console.log(`Ligne ${hit[1]}, on est en ${offset} : rien à faire.`); process.exit(0); }
  slot = hit[0];
}

const api = (path, opts = {}) => fetch(`${cfg.SUPABASE_URL}/rest/v1/${path}`, {
  ...opts, headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) }
}).then(async (r) => { if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r; });

const rows = await (await api(`habitudes?select=cle,fait&jour=eq.${jour}`)).json();
const done = (cle) => rows.some((r) => r.cle === cle && r.fait);
// What's left for this moment, in this order. Vitamin D only in the morning.
const TODO = [
  [`bouche-${slot}`, "il faut faire les exercices de bouche de Thomas"],
  [`perinee-${slot}`, "Edith doit faire sa rééducation périnéenne"],
  ...(slot === "matin" ? [["vitd", "Thomas doit prendre sa vitamine D"]] : [])
].filter(([cle]) => !done(cle));
if (!TODO.length) { console.log(`${jour} ${slot} : tout est fait.`); process.exit(0); }

const phrases = TODO.map(([, text]) => text);
const sentence = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} et ${phrases.at(-1)}` : phrases[0];
const body = sentence[0].toUpperCase() + sentence.slice(1) + ".";
const payload = JSON.stringify({ title: `Rappel du ${slot}`, body, jour, slot, cles: TODO.map(([cle]) => cle) });

const subs = await (await api("abonnements?select=endpoint,abonnement")).json();
let sent = 0;
for (const { endpoint, abonnement } of subs) {
  try { await webpush.sendNotification(abonnement, payload, { TTL: 3 * 3600, urgency: "high" }); sent++; }
  catch (e) {
    // 404/410: the phone turned reminders off or reinstalled the app
    if (e.statusCode === 404 || e.statusCode === 410) await api(`abonnements?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
    else console.error(`Échec d'envoi (${e.statusCode}): ${e.body || e.message}`);
  }
}
console.log(`${jour} ${slot} : ${sent}/${subs.length} rappel(s) envoyé(s).`);
