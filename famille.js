// Family code: the shared data (habits, measures, health...) only opens with it. Typed once on each phone,
// then who uses the phone. Every call to the database carries it (header x-famille);
// without it, the calls fail like when offline, so each screen keeps its copy and what waits to be sent.
// Load it right after config.js, before sync.js.
// The parents' first names are not in this public code: they come with the shared settings (table reglages, key
// "famille", behind the code), so "who uses this phone" is asked once the code is right.
//   Famille.ok()  Famille.qui()  Famille.ask()  Famille.setQui(name)  Famille.PEOPLE  Famille.info()
(function () {
  const cfg = self.T911 || {};
  if (!cfg.SUPABASE_URL) { window.Famille = { ok: () => true, qui: () => "", ask() {}, setQui() {}, PEOPLE: [] }; return; }
  const KEY = "thomas911-famille", WHO = "thomas911-qui", CHECKED = "thomas911-famille-verifie";
  const VALS = "thomas911-reglages"; // prefs.js's copy of the settings
  const info = () => { try { return (JSON.parse(localStorage.getItem(VALS)) || {}).famille || {}; } catch (e) { return {}; } };
  const people = () => (Array.isArray(info().parents) ? info().parents.filter((p) => typeof p === "string" && p) : []);
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const put = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
  // "Galet Renard ciel-tisane 42" -> "galet-renard-ciel-tisane-42"
  const normalize = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[\s_.,;:/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const code = () => get(KEY);
  const qui = () => get(WHO);
  // The service worker can't read localStorage: it finds the code and the name here (for "C'est fait" / "Donné")
  function share() {
    if (!("caches" in self)) return;
    caches.open("thomas911-famille").then((c) => c.put("famille.json", new Response(JSON.stringify({ code: code(), qui: qui() }),
      { headers: { "Content-Type": "application/json" } }))).catch(() => {});
  }

  // Every call to the database (tables, photos, assistant) carries the code; none goes out without it
  const rest = `${cfg.SUPABASE_URL}/rest/v1/`;
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!url || !url.startsWith(`${cfg.SUPABASE_URL}/`)) return realFetch(input, init);
    if (!code()) return Promise.reject(new TypeError("Code de la famille manquant"));
    const headers = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || {});
    headers.set("x-famille", code());
    return realFetch(input, { ...(init || {}), headers });
  };
  const check = (c) => realFetch(`${rest}rpc/famille_ok`, { method: "POST",
    headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json", "x-famille": c }, body: "{}" }).then((r) => r.json());
  // The family's settings (first names, date of birth...), kept with prefs.js's copy
  const loadInfo = (c) => realFetch(`${rest}reglages?select=valeur&cle=eq.famille`, { headers: { apikey: cfg.SUPABASE_KEY, "x-famille": c } })
    .then((r) => (r.ok ? r.json() : [])).then((rows) => {
      if (!rows[0] || !rows[0].valeur) return;
      let all = {}; try { all = JSON.parse(localStorage.getItem(VALS)) || {}; } catch (e) {}
      all.famille = rows[0].valeur; try { localStorage.setItem(VALS, JSON.stringify(all)); } catch (e) {}
    }).catch(() => {});

  // ---------- The sheet: code and who ----------
  let dlg = null;
  function sheet() {
    if (dlg) return dlg;
    const css = document.createElement("style");
    css.textContent = `
.fam { border: 0; border-radius: 22px; padding: 0; width: min(420px, calc(100vw - 24px)); background: var(--surface); color: var(--ink); box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.fam::backdrop { background: rgba(0,0,0,.45); }
.fam form { padding: 20px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
.fam h2 { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; margin: 0; }
.fam p { margin: 0; color: var(--muted); font-size: 0.88rem; line-height: 1.4; }
.fam label { display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
.fam input { font: inherit; font-size: 1.05rem; width: 100%; padding: 12px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--bg); color: var(--ink); -webkit-user-select: text; user-select: text; }
.fam input:focus { outline: none; border-color: var(--accent); }
.fam .who { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: var(--group); }
.fam .who button { font: inherit; font-weight: 700; color: var(--muted); background: none; border: 0; border-radius: 9px; padding: 10px 4px; cursor: pointer; }
.fam .who button[aria-checked="true"] { background: var(--surface); color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.fam .err { color: #c4553f; font-size: 0.85rem; min-height: 1.1em; }
.fam .acts { display: flex; gap: 8px; }
.fam .acts button { font: inherit; font-weight: 700; border-radius: 12px; padding: 12px; cursor: pointer; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
.fam .acts .go { flex: 1; background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }`;
    document.head.appendChild(css);
    dlg = document.createElement("dialog");
    dlg.className = "fam";
    dlg.innerHTML = `<form method="dialog">
      <h2>Code de la famille</h2>
      <p>Les infos de Thomas ne s'ouvrent qu'avec le code de la famille. Tape-le une seule fois sur ce téléphone.</p>
      <div><label for="famCode">Code</label><input id="famCode" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="mot-mot-mot-mot-00"></div>
      <div id="famWhoWrap" hidden><label id="famWhoLab">Qui utilise ce téléphone ?</label><div class="who" role="radiogroup" aria-labelledby="famWhoLab"></div></div>
      <div class="err" id="famErr"></div>
      <div class="acts"><button type="button" id="famLater">Plus tard</button><button type="submit" class="go" id="famGo">Valider</button></div>
    </form>`;
    document.body.appendChild(dlg);
    let who = qui(), verified = ""; // verified: the code already checked in this sheet
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const pick = (p) => { who = p; dlg.querySelectorAll(".who button").forEach((b) => b.setAttribute("aria-checked", b.dataset.p === p)); };
    const showWho = () => {
      const names = people();
      dlg.querySelector(".who").innerHTML = names.map((p) => `<button type="button" role="radio" data-p="${esc(p)}">${esc(p)}</button>`).join("");
      dlg.querySelector("#famWhoWrap").hidden = names.length < 2;
      pick(names.includes(who) ? who : names.length === 1 ? names[0] : "");
    };
    dlg.showWho = showWho;
    dlg.querySelector(".who").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { window.buzz && buzz(); pick(b.dataset.p); } });
    dlg.querySelector("#famLater").addEventListener("click", () => dlg.close());
    dlg.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const c = normalize(dlg.querySelector("#famCode").value), err = dlg.querySelector("#famErr");
      if (!c) { err.textContent = "Tape le code."; return; }
      let good = verified === c ? true : undefined;
      if (good === undefined) {
        err.textContent = "Vérification…";
        try { good = await check(c); } catch (x) { good = null; } // offline: kept, checked later
        if (good === false) { err.textContent = "Ce n'est pas le bon code. Vérifie l'orthographe (les tirets peuvent être des espaces)."; return; }
        if (good) { verified = c; await loadInfo(c); showWho(); }
        // The right code: then who uses this phone (the first names came with it)
        if (good && people().length > 1 && !people().includes(who)) { err.textContent = "Code bon ! Choisis qui utilise ce téléphone."; return; }
      }
      if (good && people().length > 1 && !people().includes(who)) { err.textContent = "Choisis qui utilise ce téléphone."; return; }
      put(KEY, c); put(WHO, people().includes(who) ? who : ""); put(CHECKED, good ? new Date().toISOString().slice(0, 10) : "");
      share();
      dlg.close();
      location.reload(); // every screen reloads its data with the code
    });
    return dlg;
  }
  function ask() {
    const d = sheet();
    d.querySelector("#famCode").value = code();
    d.querySelector("#famErr").textContent = "";
    d.showWho();
    if (!d.open) d.showModal();
  }

  // Once a day, make sure the code still opens the data (it may have been changed)
  function verify() {
    if (!code() || get(CHECKED) === new Date().toISOString().slice(0, 10)) return;
    check(code()).then((good) => {
      if (good) { put(CHECKED, new Date().toISOString().slice(0, 10)); return; }
      put(KEY, ""); share(); ask();
    }).catch(() => {});
  }
  function start() {
    if (!code()) ask(); else { share(); verify(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.Famille = { ok: () => !!code(), qui, ask, normalize, info, get PEOPLE() { return people(); },
    setQui(p) { put(WHO, people().includes(p) ? p : ""); share(); } };
})();
