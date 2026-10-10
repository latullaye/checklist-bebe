// Thomas's age and the milestones worth celebrating. Shared by the home page, the age and growth screens.
// The date and time of birth are not in this public code: they come with the shared settings (table reglages, key
// "famille", behind the family code; prefs.js keeps the phone's copy). Until this phone has them, Thomas.known is false
// and the screens say so; the first time they arrive, the page reloads with them.
(function () {
  const VALS = "thomas911-reglages"; // prefs.js's copy of the settings
  const famille = () => { try { return (JSON.parse(localStorage.getItem(VALS)) || {}).famille || {}; } catch (e) { return {}; } };
  const fam = famille();
  const BIRTH = fam.naissance ? new Date(fam.naissance) : null; // the exact instant
  const BIRTH_DAY = BIRTH && /^\d{4}-\d\d-\d\d$/.test(fam.jour || "") ? fam.jour : null; // calendar date of birth: day counts and "monthiversaries" use it
  const known = !!BIRTH_DAY;
  if (!known) {
    const cfg = self.T911 || {};
    if (cfg.SUPABASE_URL && window.Famille && Famille.ok())
      fetch(`${cfg.SUPABASE_URL}/rest/v1/reglages?select=valeur&cle=eq.famille`, { headers: { apikey: cfg.SUPABASE_KEY } })
        .then((r) => (r.ok ? r.json() : [])).then((rows) => {
          const v = rows[0] && rows[0].valeur;
          if (!v || !v.naissance || !v.jour) return;
          let all = {}; try { all = JSON.parse(localStorage.getItem(VALS)) || {}; } catch (e) {}
          all.famille = v; localStorage.setItem(VALS, JSON.stringify(all));
          if (famille().jour === v.jour) location.reload(); // not when the phone can't keep it (no reload loop)
        }).catch(() => {});
  }

  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayOf(new Date());
  // Calendar math on "YYYY-MM-DD" strings, at noon UTC so time zones never shift the date
  const toUTC = (day) => new Date(day + "T12:00:00Z");
  const fromUTC = (d) => d.toISOString().slice(0, 10);
  const addDays = (day, n) => { const d = toUTC(day); d.setUTCDate(d.getUTCDate() + n); return fromUTC(d); };
  const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
  function addMonths(day, n) {
    const [y, m, d] = day.split("-").map(Number);
    const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); // clamp the 31st to a shorter month
    return fromUTC(new Date(Date.UTC(y, m - 1 + n, Math.min(d, last), 12)));
  }
  // Whole calendar months from birth to a day, and the days left over
  function monthsAt(day) {
    let m = 0;
    while (addMonths(BIRTH_DAY, m + 1) <= day) m++;
    return { months: m, rest: daysBetween(addMonths(BIRTH_DAY, m), day) };
  }

  const plural = (n, one, many = one + "s") => `${n.toLocaleString("fr-CA")} ${n > 1 ? many : one}`;
  const join = (parts) => { parts = parts.filter(Boolean); return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : parts[0] || ""; };
  const monthsLabel = (m) => m >= 12 && m % 12 === 0 ? plural(m / 12, "an") : plural(m, "mois", "mois");
  // 15 months -> ["1 an", "3 mois"]; 3 months -> ["3 mois"]
  const yearsMonths = (m) => [m >= 12 && plural(Math.floor(m / 12), "an"), m % 12 && plural(m % 12, "mois", "mois")];

  // Every way to say his age on a given day
  function age(day = today()) {
    const days = daysBetween(BIRTH_DAY, day);
    const { months, rest } = monthsAt(day);
    return {
      days,
      weeks: Math.floor(days / 7), weekDays: days % 7,
      months, monthDays: rest,
      monthWeeks: Math.floor(rest / 7), monthWeekDays: rest % 7,
      hours: Math.floor((Date.now() - BIRTH) / 36e5),
      text: {
        days: plural(days, "jour"),
        weeks: join([days >= 7 && plural(Math.floor(days / 7), "semaine"), (days % 7 || days < 7) && plural(days % 7, "jour")]),
        months: join([...yearsMonths(months), (rest || !months) && plural(rest, "jour")]),
        monthsWeeks: join([...yearsMonths(months), rest >= 7 && plural(Math.floor(rest / 7), "semaine"), (rest % 7 || (!months && rest < 7)) && plural(rest % 7, "jour")])
      }
    };
  }
  // Short age for small labels: "104 j", "14 sem 6 j", "3 mois 12 j"
  function short(day) {
    const a = age(day);
    if (a.days < 7) return `${a.days} j`;
    if (a.days < 98) return `${a.weeks} sem${a.weekDays ? ` ${a.weekDays} j` : ""}`;
    if (a.months < 24) return `${a.months} mois${a.monthDays ? ` ${a.monthDays} j` : ""}`;
    return `${Math.floor(a.months / 12)} ans${a.months % 12 ? ` ${a.months % 12} mois` : ""}`;
  }

  // ---------- Milestones ----------
  // kind: mois | jours | semaines | heures (the last ones fall at an exact time, not just a day)
  const DAYS = [50, 100, 111, 150, 200, 222, 250, 300, 333, 400, 444, 500, 555, 600, 700, 777, 800, 888, 900, 999, 1000, 1111, 1234, 1500, 2000, 2222, 2500, 3000, 3333, 4000, 4444, 5000];
  const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250];
  const MONTHS = [...Array(24)].map((_, i) => i + 1).concat([30, 36, 42, 48, 54, 60, 72, 84, 96, 108, 120]);
  const TIMES = [ // [milliseconds after birth, label, badge number, badge unit]
    [1000 * 36e5, "1 000 heures", "1 000", "heures"], [2000 * 36e5, "2 000 heures", "2 000", "heures"],
    [5000 * 36e5, "5 000 heures", "5 000", "heures"], [10000 * 36e5, "10 000 heures", "10 000", "heures"],
    [1e5 * 6e4, "100 000 minutes", "100 000", "minutes"], [5e5 * 6e4, "500 000 minutes", "500 000", "minutes"],
    [1e6 * 6e4, "1 million de minutes", "1 million", "de minutes"],
    [1e7 * 1e3, "10 millions de secondes", "10 millions", "de secondes"], [1e8 * 1e3, "100 millions de secondes", "100 millions", "de secondes"],
    [1e9 * 1e3, "1 milliard de secondes", "1 milliard", "de secondes"]
  ];
  let cache = null;
  function milestones() {
    if (cache) return cache;
    const list = [];
    MONTHS.forEach((m) => {
      const years = m % 12 === 0;
      list.push({ day: addMonths(BIRTH_DAY, m), kind: years ? "ans" : "mois", n: m, title: monthsLabel(m), big: years || m === 6 || m <= 12,
        num: String(years ? m / 12 : m), unit: years ? (m === 12 ? "an" : "ans") : "mois" });
    });
    DAYS.forEach((n) => list.push({ day: addDays(BIRTH_DAY, n), kind: "jours", n, title: plural(n, "jour"), big: n % 100 === 0,
      num: n.toLocaleString("fr-CA"), unit: "jours" }));
    WEEKS.forEach((n) => list.push({ day: addDays(BIRTH_DAY, n * 7), kind: "semaines", n, title: plural(n, "semaine"),
      num: String(n), unit: n > 1 ? "semaines" : "semaine" }));
    TIMES.forEach(([ms, title, num, unit]) => { const at = new Date(BIRTH.getTime() + ms); list.push({ day: dayOf(at), at, kind: "heures", title, num, unit }); });
    list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.at || 0) - (b.at || 0)));
    return (cache = list);
  }
  const on = (day = today()) => milestones().filter((m) => m.day === day);
  const upcoming = (n = 12, day = today()) => milestones().filter((m) => m.day > day).slice(0, n);
  const past = (day = today()) => milestones().filter((m) => m.day < day).reverse();

  const fmtDay = (day, opts = { weekday: "long", day: "numeric", month: "long" }) => toUTC(day).toLocaleDateString("fr-CA", { ...opts, timeZone: "UTC" });
  const fmtTime = (d) => d.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit" });

  window.Thomas = { known, BIRTH, BIRTH_DAY, famille, today, addDays, daysBetween, addMonths, age, short, milestones, on, upcoming, past, fmtDay, fmtTime };
})();
