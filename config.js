// Shared settings, read by the pages and the service worker.
// Everything here is public on purpose (the site is public).
self.T911 = {
  // Supabase project that keeps the habits shared between both phones (see README).
  // Empty = each phone keeps its own copy, no reminders.
  SUPABASE_URL: "https://vvkkxphkyjejyhbcdcuw.supabase.co",
  SUPABASE_KEY: "sb_publishable_No3ABvuJPJB0-icPVvGSOg_iEiQocMT", // the "publishable" key, safe to publish
  // Web Push public key; its private half stays in the Supabase database (table prive).
  VAPID_PUBLIC: "BIOngRN0BX7ZlJmxSkyP90CTe4zcMFiZUAZDQegMO8Fo-YtbXKqtVS50LVbtL9xDf1cNaOLcMX6kDijgywWEk9k"
};
