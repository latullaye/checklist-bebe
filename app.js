// Offline copy + updates, shared by every page.
if ("serviceWorker" in navigator) {
  // Already controlled = this is an update: reload once so the new version shows right away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}));
  // Home-screen apps often resume without reloading: check for an update when brought back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}

// Back arrow: a real step back when we came from inside the app, so the phone's own back button
// doesn't loop between the home page and the screen. Opened from a reminder: go home without stacking.
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a.back");
  if (!a) return;
  e.preventDefault();
  let inside = false;
  try { inside = !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1; } catch (err) {}
  if (inside) history.back(); else location.replace(a.href);
});
// Coming back to a page kept in memory (back/forward): let it refresh what it shows.
window.addEventListener("pageshow", (e) => { if (e.persisted) document.dispatchEvent(new Event("visibilitychange")); });

// Haptic tap. Android: vibrate(). iPhone (iOS 18+) has no vibrate(), but toggling a
// native switch control gives a light haptic, so we flip a hidden one.
(function () {
  let iosSwitch = null;
  if (!navigator.vibrate) {
    iosSwitch = document.createElement("label");
    iosSwitch.setAttribute("aria-hidden", "true");
    iosSwitch.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    iosSwitch.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(iosSwitch);
  }
  window.buzz = function () {
    try {
      if (window.AndroidApp) AndroidApp.vibrate();
      else if (navigator.vibrate) navigator.vibrate(12);
      else if (iosSwitch) iosSwitch.click();
    } catch (e) {}
  };
  // Any control marked data-buzz gives the tap feedback
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-buzz]")) window.buzz(); });
})();
