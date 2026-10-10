// Reminders (Web Push): on by default, the switch is per phone. Used by the Settings screen and the
// habits screen, which makes sure this phone's subscription is on the server at each visit. Needs habits.js.
(function () {
  const NKEY = "thomas911-notifs";
  const wanted = () => { try { return localStorage.getItem(NKEY) !== "off"; } catch (e) { return true; } };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const pushOK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64 = (s) => Uint8Array.from(atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  async function subscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(T911.VAPID_PUBLIC) });
    // Who uses this phone: a dose noted here is announced to the other phone only
    const qui = (window.Famille && Famille.qui()) || undefined;
    await Habits.api("abonnements", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ endpoint: sub.endpoint, abonnement: sub.toJSON(), tz: Habits.tz(), qui }]) });
  }
  async function unsubscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await Habits.api(`abonnements?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }).catch(() => {});
    await sub.unsubscribe();
  }

  let error = "";
  // What to show: the switch, a message, and whether to offer the permission button
  function state() {
    const on = wanted();
    let msg = "", ask = false;
    if (!Habits.shared) msg = "Les rappels seront actifs une fois le partage configuré.";
    else if (isIOS && !standalone) msg = "Sur iPhone, ajoute d'abord THOMAS911 à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvre l'app depuis l'icône.";
    else if (!pushOK) msg = "Ce navigateur ne permet pas les notifications.";
    else if (on && Notification.permission === "denied") msg = "Les notifications sont bloquées pour THOMAS911 dans les réglages du téléphone.";
    else if (on && Notification.permission === "default") ask = true;
    else if (on && error) msg = error;
    return { on, msg, ask };
  }
  // Make sure this phone's subscription matches the switch (cheap, done on each visit)
  async function sync() {
    error = "";
    if (!Habits.shared || !pushOK || (isIOS && !standalone)) return state();
    try {
      if (wanted() && Notification.permission === "granted") await subscribe();
      else if (!wanted()) await unsubscribe();
    } catch (e) { error = "Impossible d'activer les rappels pour l'instant. Réessaie avec du réseau."; }
    return state();
  }
  function setWanted(on) {
    try { localStorage.setItem(NKEY, on ? "on" : "off"); } catch (e) {}
    // Asking right from the tap lets iPhone show the permission prompt
    if (on && pushOK && Notification.permission === "default" && Habits.shared) return Notification.requestPermission().then(sync);
    return sync();
  }
  const ask = () => Notification.requestPermission().then(sync);

  window.Notifs = { wanted, state, sync, setWanted, ask };
})();
