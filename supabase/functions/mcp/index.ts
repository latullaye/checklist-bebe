// THOMAS911 for Claude: an MCP server (Model Context Protocol) to read and add to the family's data from a conversation.
// Add it in Claude as a custom connector: https://<projet>.supabase.co/functions/v1/mcp?qui=<prénom>&cle=<code de la famille>
// (see README). The tools are in outils.ts, the protocol and the code check in serveur.ts; wrong codes are counted
// in the database (interne.famille_essai, with the phones').
import postgres from "postgres";
import { handle, type Essai } from "./serveur.ts";
import type { Famille } from "./outils.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
const db = {
  // Rows as JSON: dates come back as text, numbers as numbers, the same everywhere
  all: async (text: string, params: unknown[] = []) =>
    (await sql.unsafe(`select coalesce(json_agg(t), '[]'::json) as r from (${text}) t`, params as never[]))[0].r,
  exec: async (text: string, params: unknown[] = []) => [...(await sql.unsafe(text, params as never[]))]
};
// The candidate codes, one per line (a normalized code has no line break: see normalize in serveur.ts)
const essai = async (codes: string[], ip: string | null) =>
  (await sql`select interne.famille_essai(string_to_array(${codes.join("\n")}, chr(10)), ${ip}, 'mcp') as r`)[0].r as Essai;
// First names, date and town of birth: in the family's settings, not in this public code
const famille = async () => ((await sql`select valeur from reglages where cle = 'famille'`)[0]?.valeur as Famille) ?? null;

Deno.serve((req) => handle(req, { db, essai, famille }));
