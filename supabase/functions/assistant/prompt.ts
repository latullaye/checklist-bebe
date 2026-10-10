// What the assistant is asked, and what it may answer: the instructions, the JSON schemas of its answers, and the checks
// on what comes back (the phone checks again, and the parents read everything before saving).

export const MODEL = "claude-opus-5-5";

type Img = { media_type: string; data: string };
type Sym = { k: string; n?: number | null };
export type Ask = {
  sorte: "note" | "rdv";
  texte?: string;
  maintenant?: string; // "jeudi 9 octobre 2026, 16 h 20 (heure de la maison)"
  age?: string; // "3 mois, 1 semaine et 6 jours"
  par?: string;
  dry?: boolean;
  // A note
  probleme?: { nom?: string; depuis?: string } | null;
  nouveau?: boolean;
  catalogue?: [string, string, string | null][];
  autres?: string[];
  // An appointment
  rdv?: { quand?: string; type?: string; lieu?: string; pro?: string; motif?: string };
  problemes?: string[];
  medicaments?: string[];
  photos?: Img[];
  actuel?: Record<string, unknown>;
};

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\u0000/g, "").trim().slice(0, n) : "");
const list = (a: unknown) => (Array.isArray(a) ? a : []);
// "Julie et Marc" (the parents' first names), or "les parents"
const parentsText = (fam: Famille) => {
  const p = list(fam.parents).map((x) => clip(x, 40)).filter(Boolean).slice(0, 4);
  return p.length ? `${p.slice(0, -1).join(", ")}${p.length > 1 ? " et " : ""}${p.at(-1)}` : "les parents";
};

// The family, from its settings (table reglages, key "famille"): first names, date and town of birth. Not in this public code.
export type Famille = { prenom?: string; parents?: string[]; jour?: string; ville?: string };

// ---------- Instructions ----------
const COMMON = `Tu aides PARENTS à tenir le carnet de santé de leur bébé, Thomas, dans leur application familiale. Ils te transmettent ce qu'ils ont dit à voix haute (la dictée du téléphone : souvent sans ponctuation, avec des mots mal reconnus) ou tapé vite, parfois avec des photos. Tu remplis les champs de l'app à leur place ; ils relisent avant d'enregistrer, et ce texte sert ensuite au résumé montré au médecin.

Ce que tu fais :
- Tu reprends fidèlement ce qu'ils disent, rangé dans les bons champs et bien écrit. Tu n'ajoutes rien qui n'a pas été dit ou qui n'est pas clairement lisible sur une photo : pas de diagnostic, pas de conseil, pas d'interprétation, pas de dose calculée ou suggérée. Quand une information manque, le champ reste vide (null, liste vide ou texte vide).
- Tu corriges une erreur de dictée seulement quand le sens est certain (un nom de médicament mal reconnu, par exemple). Si tu hésites, garde le mot tel quel et ajoute une ligne à a_verifier.
- Les champs actuels de la fiche te sont donnés : ils peuvent contenir ce que les parents ont déjà écrit, ou une mise en forme précédente du même récit. Fusionne sans rien perdre et sans rien répéter.

Comment tu écris :
- Français du Québec, simple et factuel, phrases courtes. Garde la voix des parents (« on », « il ») ; Thomas, c'est « il » ou « Thomas ».
- Markdown léger, rien d'autre : une liste « - » quand il y a plusieurs éléments, **gras** pour un chiffre ou un fait important (une quantité, une heure, une température), « - [ ] » pour une chose à faire. Pas de titres, pas de tableaux, pas d'émojis.
- Les heures s'écrivent « 14 h » ou « 14 h 30 » ; les quantités comme elles ont été dites (« 90 mL », « 2,5 mL »).
- a_verifier : au plus 4 lignes très courtes, seulement pour ce qui est vraiment incertain (un mot mal compris, un chiffre ambigu, un champ deviné). Liste vide si tout est clair.`;

const NOTE = `Cette fois, c'est une note de ce que les parents voient, à un moment donné, pour suivre un problème de santé de Thomas.

Les champs :
- symptomes : les symptômes présents dans le récit. Prends la clé du catalogue quand elle correspond (« selles liquides » → diarrhee) ; sinon un libellé court de 1 à 3 mots avec une majuscule (« Hoquet »). n : seulement pour diarrhee (nombre de selles liquides) et vomissements (nombre de fois), quand un nombre est dit (il compte depuis la note d'avant) ; sinon null. Un symptôme dit absent (« pas de fièvre ») n'en est pas un : ne le mets pas, mais garde l'information dans observe.
- temperature : la température mesurée, en °C (convertis si elle est dite en °F) ; sinon null. À 38 °C ou plus, ajoute fievre aux symptômes.
- couches : le nombre de couches mouillées s'il est dit ; sinon null.
- observe : ce qu'ils voient et décrivent (selles, boire, sommeil, humeur, peau…).
- fait : ce qu'ils ont fait (médicament donné et à quelle heure, changement dans les boires, appel à Info-Santé…). Vide si rien.
- probleme_nom : seulement si la note ouvre un nouveau problème : son nom, le symptôme principal en 1 à 3 mots (« Diarrhée », « Fièvre ») ; sinon null.
- depuis : seulement pour un nouveau problème, le jour où ça a commencé s'il est dit (« depuis hier » → la date d'hier), au format AAAA-MM-JJ ; sinon null.`;

const RDV = `Cette fois, c'est le compte rendu d'un rendez-vous médical de Thomas, écrit après le rendez-vous : ce que les parents racontent, et parfois des photos (ordonnance, feuille de consignes, carnet de vaccination).

Les champs :
- compte_rendu : ce qui a été dit et fait pendant le rendez-vous (examen, mesures comme le poids, explications, conseils donnés), en liste courte.
- diagnostic : le diagnostic nommé par le professionnel, en quelques mots (« Gastro-entérite ») ; null s'il n'en a pas donné.
- suivi : ce qu'il faut faire ensuite, quand revenir ou consulter, chaque point en « - [ ] » (« - [ ] Revoir le médecin si la fièvre dure plus de 48 h »). Vide si rien.
- pro : qui a vu Thomas (nom et rôle, « Dre Tremblay, pédiatre »), seulement si c'est dit et que le champ actuel est vide ; sinon null.
- lieu : où, même règle ; sinon null.
- medicaments : chaque médicament prescrit ou conseillé, tel qu'il est écrit sur l'ordonnance ou dit par les parents. Tu recopies, tu ne calcules jamais une dose :
  - nom : tel qu'écrit, avec la concentration si elle est indiquée (« Amoxicilline 250 mg/5 mL ») ;
  - dose : la quantité à chaque prise, telle qu'écrite (« 4 mL ») ; null si elle n'est pas indiquée ;
  - mode : « intervalle » pour « toutes les N heures » (toutes_h = N) ; pour « N fois par jour », « intervalle » avec toutes_h = 24 / N, et une ligne à a_verifier pour que les parents choisissent les heures ; « heures » quand des heures précises sont données (heures = ["08:00", "20:00"]) ; « besoin » pour « au besoin » (toutes_h = l'écart minimal entre deux prises s'il est indiqué, max_jour = le nombre maximal par 24 h s'il est indiqué) ;
  - heures : seulement pour le mode « heures », sinon liste vide ;
  - jours : la durée du traitement en jours si elle est indiquée ; sinon null ;
  - consignes : les autres instructions (agiter, avec un boire, au réfrigérateur…) ; sinon null.
  N'invente aucun médicament. Si une partie de l'ordonnance est illisible, dis-le dans a_verifier.`;

// ---------- Schemas (every field required; "nothing" is null, [] or "") ----------
const nul = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const strs = { type: "array", items: { type: "string" } };
const NOTE_SCHEMA = {
  type: "object",
  properties: {
    symptomes: { type: "array", items: { type: "object", properties: { k: { type: "string" }, n: nul("integer") }, required: ["k", "n"], additionalProperties: false } },
    temperature: nul("number"),
    couches: nul("integer"),
    observe: { type: "string" },
    fait: { type: "string" },
    probleme_nom: nul("string"),
    depuis: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
    a_verifier: strs
  },
  required: ["symptomes", "temperature", "couches", "observe", "fait", "probleme_nom", "depuis", "a_verifier"],
  additionalProperties: false
};
const RDV_SCHEMA = {
  type: "object",
  properties: {
    compte_rendu: { type: "string" },
    diagnostic: nul("string"),
    suivi: { type: "string" },
    pro: nul("string"),
    lieu: nul("string"),
    medicaments: { type: "array", items: { type: "object", properties: {
      nom: { type: "string" }, dose: nul("string"), mode: { type: "string", enum: ["intervalle", "heures", "besoin"] },
      toutes_h: nul("number"), heures: strs, max_jour: nul("integer"), jours: nul("integer"), consignes: nul("string")
    }, required: ["nom", "dose", "mode", "toutes_h", "heures", "max_jour", "jours", "consignes"], additionalProperties: false } },
    a_verifier: strs
  },
  required: ["compte_rendu", "diagnostic", "suivi", "pro", "lieu", "medicaments", "a_verifier"],
  additionalProperties: false
};

// ---------- The request: instructions, photos, then the context, the current fields and the account ----------
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function build(ask: Ask, fam: Famille = {}) {
  if (!ask || (ask.sorte !== "note" && ask.sorte !== "rdv")) return "Sorte inconnue.";
  const texte = clip(ask.texte, 6000);
  const photos = ask.sorte === "rdv" ? list(ask.photos).slice(0, 4) as Img[] : [];
  if (photos.some((p) => !p || !IMAGE_TYPES.includes(p.media_type) || typeof p.data !== "string" || p.data.length > 3_500_000 || !/^[A-Za-z0-9+/=]+$/.test(p.data.slice(0, 200)))) return "Photo refusée.";
  if (!texte && !photos.length) return "Rien à mettre en forme.";
  const born = /^\d{4}-\d\d-\d\d$/.test(fam.jour || "") ? new Date(`${fam.jour}T12:00:00Z`).toLocaleDateString("fr-CA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "";
  const lines = [`Maintenant : ${clip(ask.maintenant, 80) || "inconnu"}.`,
    `Thomas${born ? ` : né le ${born}${fam.ville ? ` à ${clip(fam.ville, 60)}` : ""}` : ""}${ask.age ? ` ; il a ${clip(ask.age, 80)}` : ""}.`];
  if (ask.sorte === "note") {
    const p = ask.probleme;
    lines.push(ask.nouveau || !p ? "Cette note ouvre un nouveau problème (pas encore nommé)." : `Problème suivi : « ${clip(p.nom, 80)} », commencé ${clip(p.depuis, 60)}.`);
    lines.push("Catalogue des symptômes (clé : libellé, et ce que compte le nombre) :",
      ...list(ask.catalogue).slice(0, 40).map((c) => `- ${clip(c[0], 30)} : ${clip(c[1], 60)}${c[2] ? ` (${clip(c[2], 40)})` : ""}`));
    const autres = list(ask.autres).map((w) => clip(w, 40)).filter(Boolean).slice(0, 20);
    if (autres.length) lines.push(`Autres symptômes déjà notés par les parents : ${autres.join(", ")}.`);
  } else {
    const r = ask.rdv || {};
    lines.push(`Rendez-vous : ${[clip(r.quand, 80), clip(r.type, 40), clip(r.lieu, 120), clip(r.pro, 80)].filter(Boolean).join(", ")}${r.motif ? `, pour « ${clip(r.motif, 160)} »` : ""}.`);
    const probs = list(ask.problemes).map((x) => clip(x, 80)).filter(Boolean).slice(0, 8);
    if (probs.length) lines.push(`Problèmes liés : ${probs.join(" ; ")}.`);
    const meds = list(ask.medicaments).map((x) => clip(x, 120)).filter(Boolean).slice(0, 12);
    lines.push(meds.length ? `Médicaments déjà notés dans l'app : ${meds.join(" ; ")}.` : "Aucun médicament noté dans l'app pour l'instant.");
    if (photos.length) lines.push(`Photos jointes : ${photos.length}.`);
  }
  const actuel = JSON.stringify(ask.actuel && typeof ask.actuel === "object" ? ask.actuel : {}).slice(0, 8000);
  const text = `<contexte>\n${lines.join("\n")}\n</contexte>\n\n<champs_actuels>\n${actuel}\n</champs_actuels>\n\n<recit>\n${texte || "(rien de dit : seulement les photos)"}\n</recit>\n\n`
    + (ask.sorte === "note" ? "Remplis les champs de la note à partir du récit." : "Remplis le compte rendu du rendez-vous à partir du récit et des photos.");
  return {
    system: `${COMMON.replace("PARENTS", parentsText(fam))}\n\n${ask.sorte === "note" ? NOTE : RDV}`,
    content: [
      ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.media_type as "image/jpeg", data: p.data } })),
      { type: "text" as const, text }
    ],
    schema: ask.sorte === "note" ? NOTE_SCHEMA : RDV_SCHEMA,
    // A note is a quick sorting job; reading a prescription deserves more care
    effort: ask.sorte === "note" ? "low" as const : "medium" as const
  };
}

// ---------- What comes back, checked ----------
const str = (s: unknown, n: number) => clip(s, n);
const opt = (s: unknown, n: number) => clip(s, n) || null;
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);
const dec = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null);
const checks = (a: unknown) => list(a).map((x) => clip(x, 200)).filter(Boolean).slice(0, 4);
export function clean(ask: Ask, o: Record<string, unknown>) {
  if (ask.sorte === "note") {
    const keys = new Map(list(ask.catalogue).map((c) => [String(c[0]).toLowerCase(), String(c[0])]));
    const seen = new Set<string>();
    const symptomes = list(o.symptomes).slice(0, 20).map((s: Sym) => {
      const raw = clip(s && s.k, 40), k = keys.get(raw.toLowerCase()) || (raw ? raw[0].toUpperCase() + raw.slice(1) : "");
      return { k, n: int(s && s.n, 0, 40) };
    }).filter((s) => s.k && !seen.has(s.k) && seen.add(s.k));
    const temperature = dec(o.temperature, 34, 43);
    if (temperature != null && temperature >= 38 && keys.has("fievre") && !seen.has("fievre")) symptomes.push({ k: "fievre", n: null });
    return {
      symptomes, temperature, couches: int(o.couches, 0, 30),
      observe: str(o.observe, 4000), fait: str(o.fait, 4000),
      probleme_nom: opt(o.probleme_nom, 60), depuis: typeof o.depuis === "string" && /^\d{4}-\d\d-\d\d$/.test(o.depuis) ? o.depuis : null,
      a_verifier: checks(o.a_verifier)
    };
  }
  const medicaments = list(o.medicaments).slice(0, 6).map((m: Record<string, unknown>) => {
    const mode = ["intervalle", "heures", "besoin"].includes(String(m && m.mode).toLowerCase()) ? String(m.mode).toLowerCase() : "intervalle";
    const heures = mode === "heures" ? list(m.heures).map((h) => clip(h, 5)).filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)).slice(0, 8).sort() : [];
    return {
      nom: str(m && m.nom, 120), dose: opt(m && m.dose, 60), mode: mode === "heures" && !heures.length ? "intervalle" : mode,
      toutes_h: dec(m && m.toutes_h, 0.5, 168), heures, max_jour: int(m && m.max_jour, 1, 24), jours: int(m && m.jours, 1, 365), consignes: opt(m && m.consignes, 400)
    };
  }).filter((m) => m.nom);
  return {
    compte_rendu: str(o.compte_rendu, 4000), diagnostic: opt(o.diagnostic, 120), suivi: str(o.suivi, 2000),
    pro: opt(o.pro, 120), lieu: opt(o.lieu, 160), medicaments, a_verifier: checks(o.a_verifier)
  };
}
