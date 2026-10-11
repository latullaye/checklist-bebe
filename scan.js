// Document scanner for the appointment photos (a prescription, a report, a vaccination card). The page is found in the
// picture (the bright shape in the middle), its four corners can be moved by hand, then it is straightened (perspective)
// and cleaned up like a scan: white paper, dark ink, shadows gone. All on the phone, nothing leaves before saving.
//   Scan.edit(file, { retake })   -> Promise<Blob | null>  (null: cancelled; retake(): "Reprendre", take it again)
//   Scan.detect(canvas)           -> the four corners found, [top left, top right, bottom right, bottom left]
//   Scan.straighten(canvas, corners, mode)  -> a canvas ("doc": black and white, "color": whitened paper, "photo": as is)
(function () {
  const SRC_MAX = 2600, WORK = 480, OUT_MAX = 2000, QUALITY = 0.85;
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // ---------- The picture, the right way up (the browser applies EXIF), at most SRC_MAX on its long side ----------
  function load(file) {
    return new Promise((ok, ko) => {
      const img = new Image(), src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(src);
        const k = Math.min(1, SRC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = canvas(Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
        const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
        ok(c);
      };
      img.onerror = () => { URL.revokeObjectURL(src); ko(new Error("photo illisible")); };
      img.src = src;
    });
  }

  // ---------- Finding the page ----------
  function blur(a, w, h, r) { // box blur, horizontal then vertical
    const t = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) { s += a[y * w + i]; n++; }
      t[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) { s += t[j * w + x]; n++; }
      a[y * w + x] = s / n;
    }
  }
  function otsu(a) { // the brightness that best splits the picture in two
    const hist = new Float64Array(256);
    a.forEach((v) => hist[Math.min(255, Math.max(0, Math.round(v)))]++);
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = a.length - wB; if (!wF) break;
      sB += i * hist[i];
      const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (between > best) { best = between; t = i; }
    }
    return t;
  }
  const area = (q) => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;
  const convex = (q) => {
    const cross = q.map((p, i) => { const a = q[(i + 1) % 4], b = q[(i + 2) % 4]; return (a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0]); });
    return cross.every((c) => c > 0) || cross.every((c) => c < 0);
  };
  const inset = (w, h, f = 0.06) => [[w * f, h * f], [w * (1 - f), h * f], [w * (1 - f), h * (1 - f)], [w * f, h * (1 - f)]];
  function detect(src) {
    const k = Math.min(1, WORK / Math.max(src.width, src.height)), w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
    const c = canvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    blur(gray, w, h, 2); blur(gray, w, h, 2);
    const t = otsu(gray), label = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
    // The bright regions; for each one, its farthest points along the diagonals are the corners of a page
    for (let s = 0; s < w * h; s++) {
      if (label[s] || gray[s] <= t) continue;
      const id = comps.length + 1, comp = { size: 0, tl: null, tr: null, br: null, bl: null, a: Infinity, b: -Infinity, c: -Infinity, e: Infinity };
      let top = 0; stack[top++] = s; label[s] = id;
      while (top) {
        const p = stack[--top], x = p % w, y = (p - x) / w;
        comp.size++;
        if (x + y < comp.a) { comp.a = x + y; comp.tl = [x, y]; }
        if (x + y > comp.b) { comp.b = x + y; comp.br = [x, y]; }
        if (x - y > comp.c) { comp.c = x - y; comp.tr = [x, y]; }
        if (x - y < comp.e) { comp.e = x - y; comp.bl = [x, y]; }
        if (x > 0 && !label[p - 1] && gray[p - 1] > t) { label[p - 1] = id; stack[top++] = p - 1; }
        if (x < w - 1 && !label[p + 1] && gray[p + 1] > t) { label[p + 1] = id; stack[top++] = p + 1; }
        if (y > 0 && !label[p - w] && gray[p - w] > t) { label[p - w] = id; stack[top++] = p - w; }
        if (y < h - 1 && !label[p + w] && gray[p + w] > t) { label[p + w] = id; stack[top++] = p + w; }
      }
      comps.push(comp);
    }
    const mid = label[Math.floor(h / 2) * w + Math.floor(w / 2)];
    let page = mid && comps[mid - 1].size > 0.08 * w * h ? comps[mid - 1] : comps.reduce((a, b) => (!a || b.size > a.size ? b : a), null);
    const fallback = inset(src.width, src.height);
    if (!page || page.size < 0.08 * w * h) return fallback;
    const q = [page.tl, page.tr, page.br, page.bl].map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
    // Not a page (a sliver, a twisted shape, or the whole picture): the user sets the corners
    if (!convex(q) || area(q) < 0.12 * src.width * src.height) return fallback;
    return q;
  }

  // ---------- Straightening ----------
  // The homography that sends the corners of the output rectangle onto the four corners in the picture
  function homography(from, to) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = from[i], [X, Y] = to[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push(Y);
    }
    for (let c = 0; c < 8; c++) { // Gauss with partial pivoting
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
      for (let r = c + 1; r < 8; r++) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        B[r] -= f * B[c];
      }
    }
    const h = new Array(8);
    for (let r = 7; r >= 0; r--) { let s = B[r]; for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k]; h[r] = s / A[r][r]; }
    return h;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function straighten(src, q, mode = "doc") {
    const [tl, tr, br, bl] = q;
    const w0 = Math.max(dist(tl, tr), dist(bl, br)), h0 = Math.max(dist(tl, bl), dist(tr, br));
    const k = Math.min(1, OUT_MAX / Math.max(w0, h0)), W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
    const m = homography([[0, 0], [W, 0], [W, H], [0, H]], q);
    const sw = src.width, sh = src.height, s = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = canvas(W, H), og = out.getContext("2d"), img = og.createImageData(W, H), o = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, z = m[6] * px + m[7] * py + 1;
      let X = (m[0] * px + m[1] * py + m[2]) / z - 0.5, Y = (m[3] * px + m[4] * py + m[5]) / z - 0.5;
      X = Math.min(sw - 1.001, Math.max(0, X)); Y = Math.min(sh - 1.001, Math.max(0, Y));
      const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0, i = (y0 * sw + x0) * 4, j = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const a = s[i + ch], b = s[i + 4 + ch], c = s[i + sw * 4 + ch], dd = s[i + sw * 4 + 4 + ch];
        o[j + ch] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + dd * fx) * fy;
      }
      o[j + 3] = 255;
    }
    if (mode !== "photo") clean(img, mode);
    og.putImageData(img, 0, 0);
    return out;
  }
  // Like a scan: each pixel against the paper around it, so shadows and uneven light go away. The paper's brightness is
  // the brightest of each small block (the ink is never the brightest), smoothed, then spread back over the page.
  function clean(img, mode) {
    const { data: d, width: W, height: H } = img, n = W * H, lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const B = Math.max(8, Math.round(Math.max(W, H) / 90)), bw = Math.ceil(W / B), bh = Math.ceil(H / B);
    let paper = new Float32Array(bw * bh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = ((y / B) | 0) * bw + ((x / B) | 0);
      if (lum[y * W + x] > paper[k]) paper[k] = lum[y * W + x];
    }
    // A block all of ink (a bold title): its neighbours know the paper better
    const grow = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let m = 0;
      for (let j = Math.max(0, y - 1); j <= Math.min(bh - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(bw - 1, x + 1); i++) m = Math.max(m, paper[j * bw + i]);
      grow[y * bw + x] = m;
    }
    paper = grow; blur(paper, bw, bh, 2);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(bh - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = fy | 0, y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(bw - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = fx | 0, x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
        const bg = Math.max(1, (paper[y0 * bw + x0] * (1 - tx) + paper[y0 * bw + x1] * tx) * (1 - ty) + (paper[y1 * bw + x0] * (1 - tx) + paper[y1 * bw + x1] * tx) * ty);
        const i = y * W + x;
        if (mode === "doc") { // ink below half the paper's brightness is black, above 90 % it's paper; thin strokes stay grey
          const v = Math.round(255 * Math.min(1, Math.max(0, (lum[i] / bg - 0.5) / 0.4)));
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        } else { // colours kept, paper made white
          const f = 255 / (bg * 0.94);
          for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = Math.min(255, Math.round(d[i * 4 + ch] * f));
        }
      }
    }
  }

  // ---------- The screen: the picture, its four corners to move, the kind of result ----------
  const css = document.createElement("style");
  css.textContent = `
.sc { border: 0; padding: 0; margin: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; background: #000; color: #fff; }
.sc::backdrop { background: #000; }
.sc-in { position: absolute; inset: 0; display: flex; flex-direction: column; }
.sc-bar, .sc-foot { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.sc-bar { padding-top: max(10px, env(safe-area-inset-top)); }
.sc-foot { padding-bottom: max(12px, env(safe-area-inset-bottom)); flex-wrap: wrap; justify-content: center; }
.sc-bar span { flex: 1; text-align: center; font-weight: 700; font-size: 0.9rem; }
.sc button { font: inherit; font-weight: 700; color: #fff; background: rgba(255,255,255,.16); border: 0; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
.sc button.ok { background: #5fb8bf; color: #0c1716; }
.sc button:disabled { opacity: .6; }
.sc-stage { position: relative; flex: 1; min-height: 0; touch-action: none; }
.sc-stage canvas, .sc-stage svg { position: absolute; }
.sc-seg { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: rgba(255,255,255,.12); }
.sc-seg button { background: none; padding: 7px 11px; font-size: 0.85rem; }
.sc-seg button[aria-pressed="true"] { background: #fff; color: #000; }
.sc-hint { width: 100%; text-align: center; font-size: 0.75rem; color: rgba(255,255,255,.65); }`;
  document.head.appendChild(css);

  function edit(file, { retake } = {}) {
    return new Promise(async (resolve) => {
      let src;
      try { src = await load(file); } catch (e) { alert("Cette photo n'a pas pu être lue."); resolve(null); return; }
      let q = detect(src), mode = "doc";
      const dlg = document.createElement("dialog");
      dlg.className = "sc";
      dlg.innerHTML = `<div class="sc-in">
        <div class="sc-bar"><button type="button" data-a="cancel">Annuler</button><span>Ajuste les coins de la page</span>${retake ? '<button type="button" data-a="retake">Reprendre</button>' : ""}</div>
        <div class="sc-stage"><canvas></canvas><svg></svg></div>
        <div class="sc-foot">
          <div class="sc-seg" role="group" aria-label="Rendu"><button type="button" data-m="doc" aria-pressed="true">Document</button><button type="button" data-m="color" aria-pressed="false">Couleur</button><button type="button" data-m="photo" aria-pressed="false">Photo</button></div>
          <button type="button" data-a="rot" aria-label="Tourner d'un quart de tour">↻</button>
          <button type="button" class="ok" data-a="ok">Utiliser</button>
          <div class="sc-hint">Le trait épais est le haut de la page.</div>
        </div></div>`;
      document.body.appendChild(dlg);
      const stage = dlg.querySelector(".sc-stage"), cv = dlg.querySelector("canvas"), svg = dlg.querySelector("svg");
      let scale = 1, ox = 0, oy = 0;
      // The picture fits the stage; the outline is drawn in picture coordinates
      function layout() {
        const W = stage.clientWidth, H = stage.clientHeight;
        scale = Math.min(W / src.width, H / src.height);
        const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
        ox = Math.round((W - w) / 2); oy = Math.round((H - h) / 2);
        cv.width = w * (window.devicePixelRatio || 1); cv.height = h * (window.devicePixelRatio || 1);
        Object.assign(cv.style, { left: `${ox}px`, top: `${oy}px`, width: `${w}px`, height: `${h}px` });
        cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
        Object.assign(svg.style, { left: `${ox}px`, top: `${oy}px`, width: `${w}px`, height: `${h}px` });
        svg.setAttribute("viewBox", `0 0 ${src.width} ${src.height}`);
        draw();
      }
      function draw() {
        const u = 1 / scale, pts = q.map((p) => p.join(",")).join(" ");
        svg.innerHTML = `<polygon points="${pts}" fill="rgba(95,184,191,.18)" stroke="#5fb8bf" stroke-width="${2 * u}"/>`
          + `<line x1="${q[0][0]}" y1="${q[0][1]}" x2="${q[1][0]}" y2="${q[1][1]}" stroke="#5fb8bf" stroke-width="${6 * u}" stroke-linecap="round"/>`
          + q.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${13 * u}" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="${2.5 * u}"/>`).join("");
      }
      // Drag the corner nearest to the finger
      let grab = -1;
      const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
      stage.addEventListener("pointerdown", (e) => {
        const p = at(e), dists = q.map((c) => dist(c, p) * scale), i = dists.indexOf(Math.min(...dists));
        if (dists[i] > 48) return;
        grab = i; stage.setPointerCapture(e.pointerId); e.preventDefault();
      });
      stage.addEventListener("pointermove", (e) => {
        if (grab < 0) return;
        const [x, y] = at(e);
        q[grab] = [Math.min(src.width, Math.max(0, x)), Math.min(src.height, Math.max(0, y))];
        draw();
      });
      const release = () => { grab = -1; };
      stage.addEventListener("pointerup", release); stage.addEventListener("pointercancel", release);
      const done = (blob) => { window.removeEventListener("resize", layout); dlg.close(); dlg.remove(); resolve(blob); };
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(null); });
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.m) { mode = b.dataset.m; dlg.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); return; }
        const a = b.dataset.a;
        if (a === "cancel") done(null);
        else if (a === "retake") { done(null); retake(); } // still in the tap: the camera may open
        else if (a === "rot") { q = [q[3], q[0], q[1], q[2]]; draw(); } // the left edge becomes the top
        else if (a === "ok") {
          if (!convex(q)) { alert("Les coins se croisent : remets-les aux coins de la page."); return; }
          b.disabled = true; b.textContent = "…";
          setTimeout(() => straighten(src, q, mode).toBlob((blob) => done(blob), "image/jpeg", QUALITY), 30); // the "…" shows first
        }
      });
      window.addEventListener("resize", layout);
      dlg.showModal();
      layout();
    });
  }

  window.Scan = { edit, detect, straighten };
})();
