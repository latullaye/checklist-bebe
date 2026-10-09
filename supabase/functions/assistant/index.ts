// THOMAS911 assistant: what the parents tell in a few sentences (dictated or typed) becomes the fields of a health note,
// or the report of an appointment (with the prescription read from its photo). Claude writes; nothing is saved here:
// the phone fills its sheet and the parents check it before saving.
// Called by the phones with the family code (header x-famille). The Anthropic key is the function's secret ANTHROPIC_API_KEY,
// or else the row "anthropic_api_key" of the table prive (server only, like the notification keys).
// Body: { sorte: "note" | "rdv", texte, ...context } (see prompt.ts); with "dry": true it returns the request without sending it.
import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import postgres from "npm:postgres@3.4.5";
import { MODEL, build, clean, type Ask } from "./prompt.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
const ORIGINS = [/^https:\/\/latullaye\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MESSAGES: Record<string, string> = {
  code: "Code de la famille manquant ou changé.",
  cle: "L'assistant n'est pas encore branché : la clé Anthropic manque.",
  occupe: "L'assistant est très demandé en ce moment : réessaie dans une minute.",
  api: "L'assistant ne répond pas pour le moment. Remplis les champs à la main.",
  refus: "L'assistant n'a pas pu traiter ce récit. Remplis les champs à la main.",
  long: "Le récit est trop long pour une seule fois : coupe-le en deux."
};

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
async function familyOk(code: string) {
  if (!code) return false;
  const [row] = await sql`select valeur from prive where cle = 'famille_sha256'`;
  return !!row && (await sha256(code)) === row.valeur;
}
async function log(entry: { par?: string; sorte: string; modele?: string; entree?: number; sortie?: number; ms: number; refus?: boolean }) {
  try {
    await sql`insert into assistant_journal (par, sorte, modele, entree, sortie, ms, refus)
      values (${entry.par || null}, ${entry.sorte}, ${entry.modele || null}, ${entry.entree ?? null}, ${entry.sortie ?? null}, ${entry.ms}, ${!!entry.refus})`;
  } catch (_) { /* the log is only for us */ }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const head = {
    "Access-Control-Allow-Origin": ORIGINS.some((r) => r.test(origin)) ? origin : "https://latullaye.github.io",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-famille, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...head, "Content-Type": "application/json" } });
  const fail = (error: string, status: number) => json({ error, message: MESSAGES[error] || MESSAGES.api }, status);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: head });
  if (req.method !== "POST") return fail("api", 405);
  if (!(await familyOk(req.headers.get("x-famille") || ""))) return fail("code", 401);

  let ask: Ask;
  try { ask = await req.json(); } catch (_) { return json({ error: "requete", message: "Requête illisible." }, 400); }
  const built = build(ask);
  if (typeof built === "string") return json({ error: "requete", message: built }, 400);
  if (ask.dry) return json({ model: MODEL, effort: built.effort, system: built.system, schema: built.schema,
    content: built.content.map((b) => (b.type === "image" ? { type: "image", media_type: b.source.media_type, octets: Math.round(b.source.data.length * 0.75) } : b)) });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || (await sql`select valeur from prive where cle = 'anthropic_api_key'`)[0]?.valeur;
  if (!apiKey) return fail("cle", 503);
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });
  const t0 = Date.now();
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If the model declines, the API re-runs the same request on Anthropic's recommended fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: built.effort, format: { type: "json_schema", schema: built.schema } },
      system: built.system,
      messages: [{ role: "user", content: built.content }]
    });
  } catch (e) {
    await log({ par: ask.par, sorte: ask.sorte, ms: Date.now() - t0 });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail("cle", 503);
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) return fail("occupe", 503);
    console.error("assistant", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return fail("api", 502);
  }
  const refus = msg.stop_reason === "refusal";
  await log({ par: ask.par, sorte: ask.sorte, modele: msg.model, entree: msg.usage.input_tokens, sortie: msg.usage.output_tokens, ms: Date.now() - t0, refus });
  if (refus) return fail("refus", 422);
  if (msg.stop_reason === "max_tokens") return fail("long", 422);
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).at(-1) || "";
  let out: Record<string, unknown>;
  try { out = JSON.parse(text); } catch (_) { return fail("api", 502); }
  return json({ ...clean(ask, out), modele: msg.model });
});
