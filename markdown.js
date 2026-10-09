// Notes in Markdown: a small, safe subset, rendered on the phone (no library, works offline).
//   **gras**  *italique*  ~~barré~~  `code`  [lien](https://…)  https://… (made a link)
//   # Titre, ## Sous-titre   - liste / 1. liste   - [ ] à faire / - [x] fait   > citation   ---
// Markdown.html(text): HTML (everything typed is escaped first). Markdown.plain(text): readable text to copy or send.
// Markdown.flat(text): one line, for a summary. Markdown.toggle(text, n): ticks / unticks the n-th "- [ ]".
// Markdown.editor(textarea): a toolbar (bold, italic, list, to-do, title, preview), lists that continue on Enter, grows as it fills.
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ITEM = /^(\s*)([-*+•]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;
  const TASK = /^(\s*(?:[-*+•]|\d+[.)])\s+)\[( |x|X)\]/;

  // Inline marks. Links are set aside first, so nothing inside them gets reformatted.
  function inline(s) {
    const links = [];
    const keep = (html) => `\u0000${links.push(html) - 1}\u0000`;
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => keep(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`))
      .replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g, (m, pre, u) => pre + keep(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ""))}</a>`));
    return esc(s)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\u0000(\d+)\u0000/g, (m, i) => links[i]);
  }

  function html(src) {
    const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n"), out = [];
    let para = [], quote = [], lists = [], task = 0; // lists: [{ tag, indent }]
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const flushQuote = () => { if (quote.length) out.push(`<blockquote>${html(quote.join("\n"))}</blockquote>`); quote = []; };
    const closeLists = (indent = -1) => { while (lists.length && lists.at(-1).indent > indent) out.push(`</li></${lists.pop().tag}>`); };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, ""), item = line.match(ITEM);
      if (/^\s*>/.test(line)) { flushPara(); closeLists(); quote.push(line.replace(/^\s*>\s?/, "")); continue; }
      flushQuote();
      if (item) {
        flushPara();
        const indent = item[1].replace(/\t/g, "  ").length, tag = /\d/.test(item[2]) ? "ol" : "ul";
        closeLists(indent); // back out of deeper lists
        const top = lists.at(-1);
        if (top && top.indent === indent && top.tag === tag) out.push("</li>"); // next item
        else {
          if (top && top.indent === indent) out.push(`</li></${lists.pop().tag}>`); // same level, other kind
          lists.push({ tag, indent }); out.push(`<${tag}>`); // a new list (inside the open item when deeper)
        }
        if (item[3] != null) {
          const on = item[3] !== " ";
          out.push(`<li class="task${on ? " done" : ""}"><input type="checkbox" data-task="${task++}"${on ? " checked" : ""} aria-label="Fait"><span>${inline(item[4])}</span>`);
        } else out.push(`<li>${inline(item[4])}`);
        continue;
      }
      if (!line.trim()) { flushPara(); closeLists(); continue; }
      if (lists.length && /^\s{2,}\S/.test(raw)) { out.push(`<br>${inline(line.trim())}`); continue; } // a long item going on
      closeLists();
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { flushPara(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); out.push("<hr>"); continue; }
      para.push(line);
    }
    flushPara(); flushQuote(); closeLists();
    return out.join("");
  }

  // Text without the marks: to copy, share, or send by message
  const strip = (s) => s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)").replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, "$1$2")
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, "$1$2").replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?!\w)/g, "$1$2").replace(/~~([^~\n]+)~~|`([^`\n]+)`/g, "$1$2");
  function plain(src) {
    return String(src || "").replace(/\r\n?/g, "\n").split("\n").map((line) => {
      const item = line.match(ITEM);
      if (item) return `${item[1]}${/\d/.test(item[2]) ? item[2] : "•"} ${item[3] != null ? (item[3] === " " ? "☐ " : "☑ ") : ""}${strip(item[4])}`;
      return strip(line.replace(/^#{1,3}\s+/, "").replace(/^\s*>\s?/, "").replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/, "—"));
    }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // One line: items joined by « ; », sentences kept
  function flat(src) {
    const parts = [];
    plain(src).split("\n").forEach((l) => {
      const t = l.replace(/^\s*(•|\d+[.)])\s+/, "").trim();
      if (!t || t === "—") return;
      parts.push({ t, item: /^\s*(•|\d+[.)])\s/.test(l) });
    });
    return parts.map((p, i) => {
      if (!i) return p.t;
      const prev = parts[i - 1].t;
      return (p.item && parts[i - 1].item ? " ; " : /[.!?:…]$/.test(prev) ? " " : ". ") + p.t;
    }).join("");
  }
  // Tick or untick the n-th to-do of a text
  function toggle(src, n) {
    let k = -1;
    return String(src || "").split("\n").map((line) => {
      const m = line.match(TASK);
      if (!m || ++k !== n) return line;
      return line.replace(TASK, `${m[1]}[${m[2] === " " ? "x" : " "}]`);
    }).join("\n");
  }

  // ---------- Writing ----------
  const BAR = [["bold", "<b>G</b>", "Gras"], ["italic", "<i>I</i>", "Italique"], ["list", "•", "Liste"], ["task", "☐", "À faire"], ["title", "T", "Titre"]];
  function fit(ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight + 2, window.innerHeight * 0.55)}px`; }
  function editor(ta) {
    if (ta.dataset.md) return ta;
    ta.dataset.md = "1";
    const box = document.createElement("div"), bar = document.createElement("div"), view = document.createElement("div");
    box.className = "mde"; bar.className = "mde-bar"; view.className = "mde-view md"; view.hidden = true;
    bar.innerHTML = BAR.map(([k, label, name]) => `<button type="button" data-k="${k}" aria-label="${name}" title="${name}">${label}</button>`).join("")
      + `<button type="button" data-k="view" class="mde-eye" aria-pressed="false">Aperçu</button>`;
    ta.parentNode.insertBefore(box, ta); box.append(bar, ta, view);
    const set = (start, end, text, selStart, selEnd) => {
      ta.setRangeText(text, start, end, "end");
      if (selStart != null) ta.setSelectionRange(selStart, selEnd);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const lineStart = (pos) => ta.value.lastIndexOf("\n", pos - 1) + 1;
    function wrap(mark, hint) {
      const { selectionStart: a, selectionEnd: b } = ta, sel = ta.value.slice(a, b) || hint;
      set(a, b, `${mark}${sel}${mark}`, a + mark.length, a + mark.length + sel.length);
    }
    function prefix(p) { // on each line of the selection; again to take it off
      const a = lineStart(ta.selectionStart), b = ta.selectionEnd, lines = ta.value.slice(a, b).split("\n");
      const has = lines.every((l) => l.startsWith(p));
      const text = lines.map((l) => (has ? l.slice(p.length) : l.replace(/^(\s*)([-*+•]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,3}\s+)?/, `$1${p}`))).join("\n");
      set(a, b, text, a + text.length, a + text.length);
    }
    bar.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); }); // keep the keyboard and the selection
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      window.buzz && buzz();
      const k = b.dataset.k;
      if (k === "view") {
        const on = view.hidden;
        view.innerHTML = html(ta.value) || `<p class="mde-empty">Rien à afficher.</p>`;
        view.hidden = !on; ta.hidden = on; b.setAttribute("aria-pressed", on);
        bar.querySelectorAll("button:not(.mde-eye)").forEach((x) => { x.disabled = on; });
        return;
      }
      if (ta.hidden) return;
      ta.focus();
      if (k === "bold") wrap("**", "texte");
      if (k === "italic") wrap("*", "texte");
      if (k === "list") prefix("- ");
      if (k === "task") prefix("- [ ] ");
      if (k === "title") prefix("## ");
    });
    // A list goes on by itself on Enter; Enter on an empty item ends it
    ta.addEventListener("beforeinput", (e) => {
      if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph") return;
      const a = ta.selectionStart; if (a !== ta.selectionEnd) return;
      const ls = lineStart(a), line = ta.value.slice(ls, a), m = line.match(/^(\s*)([-*+•]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
      if (!m) return;
      e.preventDefault();
      if (line.trim() === m[0].trim()) { set(ls, a, "", ls, ls); return; } // empty item: out of the list
      const n = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
      const next = `\n${m[1]}${n} ${m[3] ? "[ ] " : ""}`;
      set(a, a, next, a + next.length, a + next.length);
    });
    ta.addEventListener("input", () => fit(ta));
    return ta;
  }
  // After a sheet fills its fields: right height, back to writing
  function reset(root) {
    root.querySelectorAll("textarea[data-md]").forEach((ta) => {
      const box = ta.closest(".mde"), view = box.querySelector(".mde-view"), eye = box.querySelector(".mde-eye");
      ta.hidden = false; view.hidden = true; eye.setAttribute("aria-pressed", "false");
      box.querySelectorAll(".mde-bar button").forEach((x) => { x.disabled = false; });
      fit(ta);
    });
  }

  window.Markdown = { html, plain, flat, toggle, editor, reset, fit };
})();
