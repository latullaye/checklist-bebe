// Weather where you are (Open-Meteo, no key), shared by the home page and the checklist.
// The last reading is kept 30 min on the phone so pages show it instantly.
(function () {
  const KEY = "sortie-bebe-meteo";
  const MAX_AGE = 30 * 60 * 1000;
  const UNTIL = 18; // "today" min/max and alerts cover now -> 18 h
  const RAIN_MIN = 40; // % chance of precipitation that counts as a risk
  const GUST_MIN = 60; // km/h gusts that count as strong wind

  const PATHS = {
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41",
    moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
    partly: "M12 2v2 M4.93 4.93l1.41 1.41 M20 12h2 M19.07 4.93l-1.41 1.41 M15.95 12.65a4 4 0 0 0-5.93-4.13 M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
    cloud: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",
    fog: "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24 M16 17H7 M17 21H9",
    drizzle: "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24 M8 19v1 M8 14v1 M16 19v1 M16 14v1 M12 21v1 M12 16v1",
    rain: "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24 M16 14v6 M8 14v6 M12 16v6",
    snow: "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24 M8 15h.01 M8 19h.01 M12 17h.01 M12 21h.01 M16 15h.01 M16 19h.01",
    storm: "M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97 M13 12l-3 5h4l-3 5",
    umbrella: "M22 12a10.06 10.06 1 0 0-20 0Z M12 12v8a2 2 0 0 0 4 0 M12 2v1",
    wind: "M12.8 19.6A2 2 0 1 0 14 16H2 M17.5 8a2.5 2.5 0 1 1 2 4H2 M9.8 4.4A2 2 0 1 1 11 8H2"
  };
  const svg = (path, cls = "") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

  // WMO weather codes -> [icon, label]
  function kind(code, day = true) {
    if (code <= 1) return day ? ["sun", "Ensoleillé"] : ["moon", "Dégagé"];
    if (code === 2) return day ? ["partly", "Partiellement nuageux"] : ["cloud", "Partiellement nuageux"];
    if (code === 3) return ["cloud", "Nuageux"];
    if (code <= 48) return ["fog", "Brouillard"];
    if (code <= 57) return ["drizzle", "Bruine"];
    if (code <= 67 || (code >= 80 && code <= 82)) return ["rain", "Pluie"];
    if (code <= 77 || code === 85 || code === 86) return ["snow", "Neige"];
    return ["storm", "Orage"];
  }
  const isSnow = (code) => (code >= 71 && code <= 77) || code === 85 || code === 86;

  // Local date/hour at the forecast spot.
  function localNow(w) {
    const local = new Date(Date.now() + w.offset * 1000).toISOString(); // UTC fields = local time there
    return { day: local.slice(0, 10), hour: +local.slice(11, 13) };
  }
  // Forecast hours from now until 18 h. Empty after 18 h.
  // Each hour is [time, temp, rain %, weather code, gusts km/h].
  function hoursLeft(w) {
    if (!w.hours) return [];
    const { day, hour } = localNow(w);
    if (hour >= UNTIL) return [];
    return w.hours.filter(([time]) => time.slice(0, 10) === day && +time.slice(11, 13) >= hour && +time.slice(11, 13) <= UNTIL);
  }
  function range(w) {
    const win = hoursLeft(w);
    if (!win.length) return null;
    const temps = win.map(([, temp]) => temp).concat(w.temp);
    return [Math.round(Math.min(...temps)), Math.round(Math.max(...temps))];
  }
  // Rain/snow and strong wind until 18 h: when it starts and how bad it gets. -> [path, text, detail]
  function alerts(w) {
    const win = hoursLeft(w), out = [];
    if (!win.length) return out;
    const when = (time) => time === win[0][0] ? "dès maintenant" : `à ${+time.slice(11, 13)} h`;
    const wet = win.filter(([, , pct]) => pct >= RAIN_MIN);
    if (wet.length) {
      const snow = isSnow(wet[0][3]);
      out.push([snow ? PATHS.snow : PATHS.umbrella, `Risque de ${snow ? "neige" : "pluie"} ${when(wet[0][0])}`,
        `jusqu'à ${Math.max(...wet.map(([, , pct]) => pct))} %`]);
    }
    const windy = win.filter(([, , , , gust]) => gust >= GUST_MIN);
    if (windy.length) {
      out.push([PATHS.wind, `Vents violents ${when(windy[0][0])}`,
        `rafales jusqu'à ${Math.round(Math.max(...windy.map(([, , , , gust]) => gust)))} km/h`]);
    }
    return out;
  }
  // The Weather Channel page for this spot; unit=m forces °C and km/h.
  const href = (w) => (w && w.lat != null ? `https://weather.com/fr-CA/temps/aujour/l/${w.lat},${w.lon}` : "https://weather.com/fr-CA/temps/aujour") + "?unit=m";

  let wx = null;
  try { wx = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!wx || typeof wx.temp !== "number") wx = null;
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(wx); } catch (e) {} });

  let busy = false;
  // maxAge: the weather page asks for fresher data (rain timing changes fast).
  function refresh(maxAge = MAX_AGE) {
    // Older readings (from before the 15-minute rain was added) lack it: fetch again.
    if (busy || !navigator.geolocation || (wx && wx.quarter && Date.now() - wx.at < maxAge)) return;
    busy = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude.toFixed(2), lon = pos.coords.longitude.toFixed(2);
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + "&current=temperature_2m,apparent_temperature,weather_code,is_day"
        + "&minutely_15=precipitation,snowfall&past_minutely_15=1&forecast_minutely_15=20"
        + "&hourly=temperature_2m,precipitation_probability,weather_code,wind_gusts_10m,wind_speed_10m,is_day"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
        + "&forecast_days=11&timezone=auto")
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((d) => {
          const h = d.hourly, dl = d.daily, m = d.minutely_15;
          wx = {
            temp: d.current.temperature_2m, feels: d.current.apparent_temperature,
            code: d.current.weather_code, day: d.current.is_day === 1,
            // [time, temp, rain %, code, gusts, wind, is day]
            hours: h.time.map((time, i) => [time, h.temperature_2m[i], h.precipitation_probability[i], h.weather_code[i], h.wind_gusts_10m[i], h.wind_speed_10m[i], h.is_day[i] === 1]),
            daily: dl.time.map((date, i) => [date, dl.weather_code[i], dl.temperature_2m_max[i], dl.temperature_2m_min[i], dl.precipitation_probability_max[i]]),
            // Every 15 min: [start time, precipitation mm, snowfall cm]
            quarter: m.time.map((time, i) => [time, m.precipitation[i] || 0, m.snowfall[i] || 0]),
            offset: d.utc_offset_seconds, lat, lon, at: Date.now()
          };
          try { localStorage.setItem(KEY, JSON.stringify(wx)); } catch (e) {}
          emit();
        })
        .catch(() => {})
        .finally(() => { busy = false; });
    }, () => { busy = false; }, { maximumAge: MAX_AGE, timeout: 15000 });
  }
  // Call fn with the cached reading now (if any) and again after each refresh.
  function onUpdate(fn) {
    listeners.push(fn);
    if (wx) fn(wx);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    emit(); // the "until 18 h" window moves with the clock
    refresh();
  });

  window.Wx = { PATHS, svg, kind, localNow, range, alerts, href, onUpdate, refresh, UNTIL, get data() { return wx; } };
})();
