// Light, dark or like the phone (Réglages, kept on this phone). Loaded in the <head> of every page, so the page is drawn
// in the right colours from the start. common.css does the rest with :root[data-theme="light" | "dark"].
//   Theme.get() → "system" | "light" | "dark"     Theme.set("dark")
(function () {
  const KEY = "thomas911-theme", BAR = { light: "#EEF3F1", dark: "#111A19" };
  function get() {
    let t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    return t === "light" || t === "dark" ? t : "system";
  }
  function apply() {
    const t = get(), root = document.documentElement;
    if (t === "system") delete root.dataset.theme; else root.dataset.theme = t;
    // The bar at the top of the screen follows (Android, Safari)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (m.dataset.system === undefined) m.dataset.system = m.content;
      m.content = t === "system" ? m.dataset.system : BAR[t];
    });
  }
  function set(t) {
    try { if (t === "light" || t === "dark") localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) {}
    apply();
  }
  apply();
  // A page brought back by the back button, or changed in another tab
  window.addEventListener("pageshow", apply);
  window.addEventListener("storage", (e) => { if (e.key === KEY) apply(); });
  window.Theme = { get, set };
})();
