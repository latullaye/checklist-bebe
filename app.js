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
