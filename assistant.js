// Dictation and the assistant, for the health sheets.
// - Assistant.dictate(textarea, onState): the phone's speech recognition, in French, writes into the textarea as you speak.
//   Without it (or when the phone refuses), the keyboard's microphone does the same job: the textarea is focused.
// - Assistant.ask(sorte, body): sends what was told to the "assistant" function (Claude), which answers with the sheet's
//   fields, written up. Nothing is saved there: the sheet is filled and the parents check before saving.
(function () {
  const cfg = self.T911 || {};
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------- Dictation ----------
  // Recognition stops by itself after a silence (always on Android): it starts again until "Arrêter".
  let current = null;
  function dictate(ta, onState = () => {}) {
    if (current) { current.stop(); return null; }
    if (!SR) { ta.focus(); onState("clavier"); return null; }
    const rec = new SR();
    rec.lang = "fr-CA"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let base = ta.value.replace(/\s+$/, ""), heard = "", on = true, failed = false;
    const join = (a, b) => (a && b ? `${a}${/[.!?…]$/.test(a) ? " " : /\n$/.test(a) ? "" : " "}${b}` : a || b);
    const show = (interim) => {
      ta.value = join(join(base, heard), interim);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.scrollTop = ta.scrollHeight;
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i], t = r[0].transcript.trim();
        if (!t) continue;
        // A capital only where a sentence starts
        if (r.isFinal) heard = join(heard, /^$|[.!?…]\s*$/.test(join(base, heard)) ? t[0].toUpperCase() + t.slice(1) : t); else interim = join(interim, t);
      }
      show(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // a silence: it starts again
      failed = true; on = false;
      onState(e.error === "not-allowed" || e.error === "service-not-allowed" ? "refus" : e.error === "network" ? "reseau" : "erreur");
    };
    rec.onend = () => {
      show("");
      if (on) { base = ta.value.replace(/\s+$/, ""); heard = ""; try { rec.start(); return; } catch (x) { on = false; } }
      current = null;
      if (!failed) onState("fin");
    };
    current = { stop() { on = false; try { rec.stop(); } catch (x) {} } };
    try { rec.start(); onState("ecoute"); } catch (x) { current = null; ta.focus(); onState("clavier"); return null; }
    return current;
  }
  const stopDictation = () => { if (current) current.stop(); };

  // ---------- The assistant ----------
  async function ask(sorte, body) {
    if (!cfg.SUPABASE_URL) throw Object.assign(new Error("L'assistant a besoin du partage."), { code: "api" });
    if (navigator.onLine === false) throw Object.assign(new Error("Pas de réseau : la mise en forme a besoin d'internet. Les champs se remplissent aussi à la main."), { code: "reseau" });
    let r;
    try {
      r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/assistant`, {
        method: "POST", headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ sorte, par: window.Famille ? Famille.qui() : "", ...body })
      });
    } catch (e) {
      throw Object.assign(new Error(window.Famille && !Famille.ok() ? "Il faut d'abord le code de la famille." : "Pas de réseau : la mise en forme a besoin d'internet."), { code: "reseau" });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.message || "L'assistant ne répond pas pour le moment."), { code: data.error || "api" });
    return data;
  }

  window.Assistant = { dictate, stopDictation, ask, get canDictate() { return !!SR; } };
})();
