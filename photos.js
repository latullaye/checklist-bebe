// Photos of the health notes and appointments (a rash, a stool, the prescription...). Taken or picked on the phone, made
// lighter (1600 px, JPEG), kept on the phone (Cache Storage) and sent to the private bucket "sante-photos", which only
// opens with the family code (famille.js adds it). Offline, they wait on the phone and leave with the network, like the notes.
//   Photos.field(el)            the photos of a sheet: thumbnails, "+ Photo", ×; .set(names) .get() .save() .cancel()
//   Photos.hydrate(root)        fills every <img data-photo="name"> inside root
//   Photos.show(names, i)       full screen, with "previous", "next" and "share"
//   Photos.remove(names)        a note or an appointment is deleted: its photos go too
//   Photos.base64(name)         { media_type, data }, for the assistant (assistant.js)
(function () {
  const cfg = self.T911 || {};
  const BUCKET = "sante-photos", CACHE = "thomas911-photos", QUEUE = "thomas911-photos-attente";
  const MAX_SIDE = 1600, QUALITY = 0.82, PER_SHEET = 6;
  const object = `${cfg.SUPABASE_URL}/storage/v1/object`;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uuid = () => (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const valid = (n) => /^[\w-]+\.(jpg|png|webp)$/.test(n);

  // ---------- On the phone ----------
  const key = (name) => new URL(`photos/${name}`, location.href).href;
  const box = () => ("caches" in self ? caches.open(CACHE) : Promise.reject(new Error("pas de cache")));
  const fromPhone = (name) => box().then((c) => c.match(key(name))).then((r) => (r ? r.blob() : null)).catch(() => null);
  const keep = (name, blob) => box().then((c) => c.put(key(name), new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } }))).catch(() => {});
  const forget = (name) => box().then((c) => c.delete(key(name))).catch(() => {});

  // Lighter: 1600 px on the long side, JPEG. The phone turns the picture the right way up (EXIF) when it decodes it.
  function shrink(file) {
    return new Promise((ok, ko) => {
      const img = new Image(), src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(src);
        const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? ok(b) : ko(new Error("photo illisible"))), "image/jpeg", QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(src); ko(new Error("photo illisible")); };
      img.src = src;
    });
  }

  // ---------- To the bucket, in order; offline they wait ----------
  let queue = read(QUEUE, []), flushing = null, error = ""; // [{ up: name } | { del: name }]
  const push = (op) => { queue.push(op); write(QUEUE, queue); flush(); };
  const httpError = async (r) => { const e = new Error(await r.text().catch(() => "") || r.status); e.http = r.status; return e; };
  function flush() {
    if (!cfg.SUPABASE_URL || !queue.length) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (async () => {
      while (queue.length) {
        const op = queue[0];
        try {
          if (op.up) {
            const blob = await fromPhone(op.up);
            if (blob) {
              const r = await fetch(`${object}/${BUCKET}/${op.up}`, { method: "POST", headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": blob.type || "image/jpeg" }, body: blob });
              if (!r.ok) { const e = await httpError(r); if (!/Duplicate|already exists/i.test(e.message)) throw e; } // sent before, its answer lost
            }
          } else if (op.del) {
            const r = await fetch(`${object}/${BUCKET}`, { method: "DELETE", headers: { apikey: cfg.SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [op.del] }) });
            if (!r.ok) throw await httpError(r);
            forget(op.del); drop(op.del);
          }
        } catch (e) {
          if (!e.http) break; // no network (or no family code yet): later
          error = "Une photo n'a pas pu être envoyée (refusée par le serveur).";
        }
        queue.shift(); write(QUEUE, queue);
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  window.addEventListener("online", () => flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });
  setTimeout(flush, 1500);

  // ---------- Showing them ----------
  const shown = new Map(); // name -> object URL, or the promise of one
  function drop(name) { const u = shown.get(name); if (typeof u === "string") URL.revokeObjectURL(u); shown.delete(name); }
  function url(name) {
    if (shown.has(name)) return Promise.resolve(shown.get(name));
    const p = (async () => {
      let blob = await fromPhone(name);
      if (!blob) {
        const r = await fetch(`${object}/authenticated/${BUCKET}/${name}`, { headers: { apikey: cfg.SUPABASE_KEY } });
        if (!r.ok) throw await httpError(r);
        blob = await r.blob();
        keep(name, blob);
      }
      const u = URL.createObjectURL(blob);
      shown.set(name, u);
      return u;
    })();
    shown.set(name, p);
    p.catch(() => shown.delete(name));
    return p;
  }
  function hydrate(root) {
    (root || document).querySelectorAll("img[data-photo]").forEach((img) => {
      const name = img.dataset.photo, ready = shown.get(name);
      if (img.dataset.src === name) return;
      img.dataset.src = name;
      if (typeof ready === "string") { img.src = ready; return; }
      const tile = img.closest(".ph-thumb, .ph-mini");
      if (tile) tile.classList.add("loading");
      url(name).then((u) => { img.src = u; }, () => { img.alt = "Photo pas encore là (hors ligne ?)"; if (tile) tile.classList.add("gone"); })
        .finally(() => { if (tile) tile.classList.remove("loading"); });
    });
  }
  async function base64(name) {
    const blob = await fromPhone(name) || await fetch(await url(name)).then((r) => r.blob());
    const data = await new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = ko; f.readAsDataURL(blob); });
    return { media_type: blob.type || "image/jpeg", data };
  }

  // ---------- Styles (thumbnails, the full screen view) ----------
  const css = document.createElement("style");
  css.textContent = `
.ph-field { display: flex; flex-wrap: wrap; gap: 8px; }
.ph-thumb, .ph-add, .ph-mini { position: relative; width: 72px; height: 72px; border-radius: 12px; overflow: hidden; flex: none; background: var(--group); }
.ph-thumb img, .ph-mini img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.ph-thumb.loading, .ph-mini.loading { animation: ph-wait 1.2s ease-in-out infinite alternate; }
.ph-thumb.gone img, .ph-mini.gone img { opacity: 0; }
.ph-thumb.gone::after, .ph-mini.gone::after { content: "Hors ligne"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; color: var(--muted); }
@keyframes ph-wait { from { opacity: .55; } to { opacity: 1; } }
.ph-thumb button { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font: inherit; font-weight: 800; line-height: 1; cursor: pointer; }
.ph-add { font: inherit; font-size: 0.74rem; font-weight: 700; color: var(--accent); border: 1.5px dashed color-mix(in srgb, var(--accent) 55%, var(--line)); background: var(--bg);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; }
.ph-add svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ph-add[aria-busy="true"] { opacity: .6; }
.ph-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ph-row .ph-mini { width: 60px; height: 60px; border-radius: 10px; }
.ph-view { border: 0; padding: 0; margin: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; background: #000; color: #fff; }
.ph-view::backdrop { background: #000; }
.ph-view .ph-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; touch-action: pan-y pinch-zoom; }
.ph-view .ph-stage img { max-width: 100%; max-height: 100%; object-fit: contain; -webkit-user-select: none; user-select: none; }
.ph-view .ph-bar { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 8px; padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,0)); }
.ph-view .ph-bar span { flex: 1; font-weight: 700; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
.ph-view button { font: inherit; font-weight: 700; color: #fff; background: rgba(255,255,255,.16); border: 0; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
.ph-view .ph-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; padding: 0; font-size: 1.4rem; }
.ph-view .ph-prev { left: 10px; } .ph-view .ph-next { right: 10px; }
.ph-view .ph-nav[hidden] { display: none; }`;
  document.head.appendChild(css);
  const CAMERA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;

  // ---------- The photos of a sheet ----------
  // Picked photos stay on this phone until the sheet is saved; "Annuler" forgets them.
  function field(el, { onChange } = {}) {
    let start = [], list = [], busy = 0;
    el.classList.add("ph-field");
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true; input.hidden = true;
    function render() {
      el.innerHTML = list.map((n, i) => `<span class="ph-thumb"><img data-photo="${esc(n)}" alt="Photo ${i + 1}" data-i="${i}"><button type="button" data-rm="${i}" aria-label="Enlever cette photo">×</button></span>`).join("")
        + (list.length + busy < PER_SHEET ? `<button type="button" class="ph-add"${busy ? ' aria-busy="true"' : ""}>${CAMERA}${busy ? "…" : "Photo"}</button>` : "");
      el.appendChild(input);
      hydrate(el);
    }
    el.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]"), add = e.target.closest(".ph-add"), img = e.target.closest("img[data-i]");
      if (rm) { window.buzz && buzz(); list.splice(Number(rm.dataset.rm), 1); render(); onChange && onChange(); }
      else if (add) { window.buzz && buzz(); input.click(); }
      else if (img) show(list, Number(img.dataset.i));
    });
    input.addEventListener("change", async () => {
      const files = [...input.files].slice(0, PER_SHEET - list.length); input.value = "";
      busy = files.length; render();
      for (const f of files) {
        try {
          const blob = await shrink(f), name = `${uuid()}.jpg`;
          await keep(name, blob);
          list.push(name);
        } catch (e) { alert("Cette photo n'a pas pu être lue."); }
        busy--; render();
      }
      onChange && onChange();
    });
    render();
    return {
      set(names) { start = (names || []).filter(valid); list = [...start]; busy = 0; render(); },
      get: () => [...list],
      // Saved: the new ones leave for the bucket, the ones taken off are deleted there
      save() {
        list.filter((n) => !start.includes(n)).forEach((n) => push({ up: n }));
        start.filter((n) => !list.includes(n)).forEach((n) => push({ del: n }));
        start = [...list];
      },
      // Cancelled: the ones picked in this sheet are forgotten
      cancel() {
        const picked = list.filter((n) => !start.includes(n));
        picked.forEach((n) => { forget(n); drop(n); });
        if (picked.length || list.length !== start.length) { list = [...start]; render(); }
      },
      // Deleted with its note or appointment (Photos.remove does the rest)
      clear() { start = []; list = []; render(); }
    };
  }
  function remove(names) { (names || []).filter(valid).forEach((n) => push({ del: n })); }

  // ---------- Full screen ----------
  let view = null, names = [], at = 0;
  function viewer() {
    if (view) return view;
    view = document.createElement("dialog");
    view.className = "ph-view";
    view.innerHTML = `<div class="ph-stage"><img alt=""></div>
      <div class="ph-bar"><span></span><button type="button" data-share hidden>Partager</button><button type="button" data-close>Fermer</button></div>
      <button type="button" class="ph-nav ph-prev" aria-label="Photo précédente">‹</button><button type="button" class="ph-nav ph-next" aria-label="Photo suivante">›</button>`;
    document.body.appendChild(view);
    view.querySelector("[data-close]").addEventListener("click", () => view.close());
    view.querySelector(".ph-prev").addEventListener("click", () => go(-1));
    view.querySelector(".ph-next").addEventListener("click", () => go(1));
    view.querySelector("[data-share]").addEventListener("click", async () => {
      try {
        const blob = await fetch(await url(names[at])).then((r) => r.blob());
        await navigator.share({ files: [new File([blob], `thomas-${at + 1}.jpg`, { type: blob.type || "image/jpeg" })] });
      } catch (e) {}
    });
    let x0 = null; // swipe left / right
    view.addEventListener("touchstart", (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    view.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); x0 = null; });
    view.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });
    return view;
  }
  function paint() {
    const v = viewer(), img = v.querySelector(".ph-stage img");
    v.querySelector(".ph-bar span").textContent = names.length > 1 ? `${at + 1} / ${names.length}` : "";
    v.querySelector(".ph-prev").hidden = at <= 0; v.querySelector(".ph-next").hidden = at >= names.length - 1;
    v.querySelector("[data-share]").hidden = !(navigator.canShare && navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] }));
    img.removeAttribute("src"); img.alt = `Photo ${at + 1}`;
    const name = names[at];
    url(name).then((u) => { if (names[at] === name) img.src = u; }, () => { img.alt = "Photo pas encore là (hors ligne ?)"; });
  }
  function go(d) { const n = at + d; if (n < 0 || n >= names.length) return; at = n; paint(); }
  function show(list, i = 0) {
    names = (list || []).filter(valid); if (!names.length) return;
    at = Math.max(0, Math.min(i, names.length - 1));
    const v = viewer(); paint(); if (!v.open) v.showModal();
  }

  window.Photos = { field, hydrate, show, remove, base64, flush, url, get error() { return error; }, get waiting() { return queue.length; } };
})();
