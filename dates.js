// Date and time fields you can type in. Each <input type="date|time"> gets a text field beside it that opens the phone's
// number pad: "11102026" shows as 11/10/2026, "1845" as 18 h 45 (the separators come by themselves, "9" is 09). The small
// calendar or clock on the right still opens the phone's own picker. The original field stays the one the pages read and
// set (ISO value, its "input" and "change" events, min and max, hidden): this only adds a way to fill it.
(function () {
  const DESC = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const ICONS = {
    date: '<path d="M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5"/>',
    time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  // [parts, their lengths, the highest first digit of each part (a higher one is padded: "4" -> "04"), separator]
  const KINDS = {
    date: { lens: [2, 2, 4], first: ["3", "1", null], sep: "/", hint: "jj/mm/aaaa" },
    time: { lens: [2, 2], first: ["2", "5"], sep: " h ", hint: "hh h mm" }
  };

  // Digits -> "11/10/2026" or "18 h 45" (with the next separator once a part is full, unless the user is deleting)
  function format(kind, digits, deleting) {
    const { lens, first, sep } = KINDS[kind], parts = [""];
    for (const ch of digits) {
      const p = parts.length - 1;
      if (p >= lens.length) break;
      parts[p] += !parts[p] && first[p] && ch > first[p] ? `0${ch}` : ch;
      if (parts[p].length >= lens[p]) { parts[p] = parts[p].slice(0, lens[p]); if (p < lens.length - 1) parts.push(""); else break; }
    }
    const open = parts[parts.length - 1] === "";
    return parts.filter(Boolean).join(sep) + (open && parts.length > 1 && !deleting ? sep : "");
  }
  // Typed text -> ISO value ("2026-10-11", "18:45"), "" when empty, null when not a real date or time
  function parse(kind, text, finish) {
    let d = text.replace(/\D/g, "");
    if (!d) return "";
    if (kind === "date") {
      if (finish && d.length === 4) d += String(new Date().getFullYear()); // "11/10": this year
      if (d.length !== 8) return null;
      const day = +d.slice(0, 2), m = +d.slice(2, 4), y = +d.slice(4);
      const t = new Date(Date.UTC(y, m - 1, day));
      if (y < 1900 || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== day) return null;
      return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
    }
    if (finish && d.length === 2) d += "00"; // "18": 18 h
    if (finish && d.length === 3) d = d.slice(0, 2) + "0" + d[2];
    if (d.length !== 4 || +d.slice(0, 2) > 23 || +d.slice(2) > 59) return null;
    return `${d.slice(0, 2)}:${d.slice(2)}`;
  }
  const show = (kind, iso) => {
    if (!iso) return "";
    if (kind === "date") { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
    return iso.slice(0, 5).replace(":", " h ");
  };

  const css = document.createElement("style");
  css.textContent = `
.dt { position: relative; display: block; width: 100%; flex: 1 1 auto; min-width: 0; overflow: hidden; border-radius: 12px; }
.dt > input.dt-txt { padding-right: 42px; font-variant-numeric: tabular-nums; }
.dt > input.dt-txt[aria-invalid="true"] { border-color: #c4553f; }
.dt > svg { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; color: var(--muted, #5d706d);
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.dt > input.dt-pick { position: absolute; top: 0; right: 0; bottom: 0; width: 46px; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0;
  cursor: pointer; min-width: 0; max-width: 46px; background: none; -webkit-appearance: none; appearance: none; }`;
  document.head.appendChild(css);

  function enhance(orig) {
    if (orig.dataset.dt || !KINDS[orig.type] || !orig.parentNode) return;
    orig.dataset.dt = "1";
    const kind = orig.type, wrap = document.createElement("span"), txt = document.createElement("input");
    wrap.className = "dt";
    wrap.style.cssText = orig.style.cssText; orig.style.cssText = "";
    txt.type = "text"; txt.className = `dt-txt ${orig.className}`.trim();
    txt.inputMode = "numeric"; txt.autocomplete = "off"; txt.placeholder = KINDS[kind].hint; txt.enterKeyHint = "done";
    const labelled = orig.id && document.querySelector(`label[for="${orig.id}"]`);
    if (!labelled) txt.setAttribute("aria-label", kind === "date" ? "Date" : "Heure");
    if (orig.id) { txt.id = `${orig.id}-txt`; document.querySelectorAll(`label[for="${orig.id}"]`).forEach((l) => { l.htmlFor = txt.id; }); }
    orig.classList.add("dt-pick"); orig.tabIndex = -1; orig.setAttribute("aria-label", kind === "date" ? "Choisir dans le calendrier" : "Choisir l'heure");
    orig.parentNode.insertBefore(wrap, orig);
    wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[kind]}</svg>`;
    wrap.prepend(txt); wrap.append(orig);

    // A wrong date says so (and stops the form), until it is fixed or the page sets another value
    const flag = (msg) => {
      txt.setCustomValidity(msg);
      if (msg) txt.setAttribute("aria-invalid", "true"); else txt.removeAttribute("aria-invalid");
    };
    // The pages set the value in code: the text follows
    const paint = () => { txt.value = show(kind, DESC.get.call(orig)); flag(""); };
    Object.defineProperty(orig, "value", { configurable: true, get() { return DESC.get.call(this); }, set(v) { DESC.set.call(this, v); paint(); } });
    orig.focus = (o) => txt.focus(o);
    // The picker: the text follows (it fires its own events for the page)
    orig.addEventListener("input", paint); orig.addEventListener("change", paint);
    orig.addEventListener("click", () => { try { orig.showPicker(); } catch (e) {} });
    // hidden, disabled and required stay the original's (min and max are read from it)
    const mirror = () => { wrap.hidden = orig.hidden; txt.disabled = orig.disabled; txt.required = orig.required; };
    new MutationObserver(mirror).observe(orig, { attributes: true, attributeFilter: ["hidden", "disabled", "required"] });
    mirror();

    const what = kind === "date" ? "Date" : "Heure";
    const outOfRange = (iso) => !iso ? "" : orig.min && iso < orig.min ? `Au plus tôt ${show(kind, orig.min)}`
      : orig.max && iso > orig.max ? `Au plus tard ${show(kind, orig.max)}` : "";
    function commit(iso) {
      if (iso === DESC.get.call(orig)) return;
      DESC.set.call(orig, iso);
      orig.dispatchEvent(new Event("input", { bubbles: true }));
      orig.dispatchEvent(new Event("change", { bubbles: true }));
    }
    txt.addEventListener("input", (e) => {
      const deleting = /^delete/.test(e.inputType || "");
      const f = format(kind, txt.value.replace(/\D/g, ""), deleting);
      if (f !== txt.value) { txt.value = f; txt.setSelectionRange(f.length, f.length); }
      const iso = parse(kind, f, false), full = f.replace(/\D/g, "").length === KINDS[kind].lens.reduce((a, b) => a + b);
      const msg = iso === null ? (full ? `${what} impossible` : "") : outOfRange(iso);
      flag(msg);
      if (iso !== null && !msg) commit(iso);
    });
    // Leaving the field: finish it ("11/10" this year, "18" 18 h 00); a wrong one stays shown in red and stops the form
    txt.finish = () => {
      const iso = parse(kind, txt.value, true);
      const msg = iso === null ? `${what} incomplète ou impossible (${KINDS[kind].hint})` : outOfRange(iso);
      if (msg) { flag(msg); return; }
      commit(iso); paint();
    };
    txt.addEventListener("blur", txt.finish);
    txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); txt.blur(); } });
    paint();
  }

  // On a phone, tapping « Enregistrer » does not always take the focus from the field: finish it first
  document.addEventListener("click", (e) => {
    const a = document.activeElement;
    if (a && a.finish && a.classList.contains("dt-txt") && e.target !== a) a.finish();
  }, true);

  const scan = (root) => root.querySelectorAll && root.querySelectorAll('input[type="date"], input[type="time"]').forEach(enhance);
  scan(document);
  // Fields added later (the times of a medication)
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type="date"], input[type="time"]')) enhance(n); else scan(n);
  }))).observe(document.documentElement, { childList: true, subtree: true });

  window.Dates = { format, parse, enhance };
})();
