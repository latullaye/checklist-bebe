// Sync status shown in the page header: "À jour", "Hors ligne", or what is still waiting to be sent.
// It watches the calls to Supabase (whatever page makes them) and counts what each feature keeps
// aside while offline. Load it right after config.js, before the page's own scripts.
(function () {
  const cfg = self.T911 || {};
  if (!cfg.SUPABASE_URL) return;
  // What waits to be sent, per feature: localStorage key -> how to count it
  const QUEUES = {
    "sortie-bebe-attente": (v) => Object.keys(v || {}).length,          // checklist
    "thomas911-habitudes-attente": (v) => Object.keys(v || {}).length,  // habits
    "thomas911-reglages-attente": (v) => Object.keys(v || {}).length,   // shared settings
    "thomas911-outbox": (v) => (Array.isArray(v) ? v.length : 0),       // growth measures
    "thomas911-sante-attente": (v) => (Array.isArray(v) ? v.length : 0) // health notes, appointments, medications
  };
  let online = navigator.onLine !== false, lastOk = 0, el = null;
  const waiting = () => {
    let n = 0;
    for (const [k, count] of Object.entries(QUEUES)) { try { n += count(JSON.parse(localStorage.getItem(k))); } catch (e) {} }
    return n;
  };
  function render() {
    if (!el) return;
    const locked = window.Famille && !Famille.ok(); // no family code on this phone yet (famille.js)
    const n = waiting(), state = locked ? "lock" : !online ? "off" : n ? "wait" : lastOk ? "ok" : "sync";
    el.className = "sync-pill " + state;
    el.textContent = state === "lock" ? "Code famille ?" : state === "off" ? (n ? `Hors ligne · ${n} en attente` : "Hors ligne")
      : state === "wait" ? `${n} en attente` : state === "ok" ? "À jour" : "Synchro…";
    el.title = state === "ok" ? "Partagé entre vos téléphones" : state === "off" ? "Ce qui est noté partira au retour du réseau"
      : state === "lock" ? "Touche pour entrer le code de la famille" : "";
  }
  // Watch the calls to the shared database
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const p = realFetch(input, init);
    if (url && url.startsWith(cfg.SUPABASE_URL)) {
      p.then(() => { online = true; lastOk = Date.now(); setTimeout(render, 0); },
        () => { online = false; setTimeout(render, 0); });
    }
    return p;
  };
  window.addEventListener("online", () => { online = true; render(); });
  window.addEventListener("offline", () => { online = false; render(); });
  setInterval(render, 2000);
  // The pill goes in the page header (or wherever a .sync-slot is)
  function mount() {
    const slot = document.querySelector(".sync-slot") || document.querySelector(".top");
    if (!slot) return;
    el = document.createElement("span");
    el.setAttribute("role", "status");
    el.addEventListener("click", () => { if (window.Famille && !Famille.ok()) Famille.ask(); });
    slot.appendChild(el);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.Sync = { render, waiting, get online() { return online; } };
})();
