// Shared settings, read by the pages, the service worker and the GitHub reminder job.
// Everything here is public on purpose (the site is public).
self.T911 = {
  // Supabase project that keeps the habits shared between both phones (see README).
  // Empty = each phone keeps its own copy, no reminders.
  SUPABASE_URL: "",
  SUPABASE_KEY: "", // the "publishable" (anon) key, safe to publish
  // Web Push public key; its private half is the VAPID_PRIVATE_KEY secret on GitHub.
  VAPID_PUBLIC: "BFzxfaENKEX4PE7u7Lxxi6f-ZXfMREebpLlem2DsTKHdenrScxON5Sb9V6KwSMlEtfcUyJTXMFjmmbq78ajeQIc"
};
