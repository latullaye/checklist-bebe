// The red badge on the app icon: what's left of this moment's habits plus the doses due now. Each part is set by whoever
// knows it (habits.js and sante.js on the pages, the reminders in sw.js) and kept where both sides read it (Cache API,
// next to the family code), so a reminder about a dose doesn't wipe the habits' count and the other way round.
// iPhone shows the number; Android shows its own dot while a reminder is in the tray.
(function (g) {
  const CACHE = "thomas911-famille", KEY = "pastille.json";
  let chain = Promise.resolve();
  // set("prises", 2), or set("prises", (n) => n - 1) from the value kept
  function set(part, value) {
    if (!("caches" in g)) return chain;
    chain = chain.then(() => caches.open(CACHE)).then(async (c) => {
      const r = await c.match(KEY), parts = r ? await r.json() : {};
      const n = typeof value === "function" ? value(parts[part] || 0) : value;
      parts[part] = Math.max(0, Number(n) || 0);
      await c.put(KEY, new Response(JSON.stringify(parts), { headers: { "Content-Type": "application/json" } }));
      const total = Object.values(parts).reduce((s, x) => s + x, 0), nav = g.navigator;
      if (nav && nav.setAppBadge) await (total ? nav.setAppBadge(total) : nav.clearAppBadge()).catch(() => {});
    }).catch(() => {});
    return chain;
  }
  g.Pastille = { set };
})(self);
