// The MCP server (Streamable HTTP, stateless): checks the family code, then answers with the tools of outils.ts.
// The code comes in a header, "x-famille: <code>" or "Authorization: Bearer <code>" (typed like on the phones: spaces,
// capitals and accents don't matter). In the address: ?qui=Arthur (who writes), ?tz=Europe/Paris (else Montréal).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DEFAULT_TZ } from "../sante/logic.ts";
import { register, INSTRUCTIONS, type Db } from "./outils.ts";

export type Deps = { db: Db; familleSha256: () => Promise<string | null>; now?: () => number };
const PEOPLE = ["Arthur", "Edith"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-famille, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id"
};
// The same as famille.js: "Galet Renard ciel-tisane 42" -> "galet-renard-ciel-tisane-42"
export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
  .replace(/[\s_.,;:/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
const zone = (tz: string | null) => { if (!tz) return null; try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return null; } };

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // No session, so no stream to keep open (GET) nor to close (DELETE): the protocol allows answering 405
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  const url = new URL(req.url);
  const code = normalize(req.headers.get("x-famille") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  const expected = code ? await deps.familleSha256() : null;
  if (!code || !expected || (await sha256(code)) !== expected) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Code de la famille manquant ou faux (en-tête x-famille ou Authorization: Bearer)." }, id: null }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const qui = PEOPLE.find((p) => p.toLowerCase() === (url.searchParams.get("qui") || "").toLowerCase()) || null;
  const server = new McpServer({ name: "thomas911", title: "THOMAS911", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  register(server, { db: deps.db, par: qui, tz: zone(url.searchParams.get("tz")) || DEFAULT_TZ, now: deps.now || Date.now });
  // No session: every request stands alone, answered in plain JSON
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}
