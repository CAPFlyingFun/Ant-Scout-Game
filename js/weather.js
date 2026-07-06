/* ============================================================
   weather.js — real-time local weather (Open-Meteo, no API key)
   Drives sky colour, wind strength, and precipitation effects.
   ZIP -> coords via Zippopotam.us; or device GPS.
   All requests are CORS-friendly and work from a local file.
   ============================================================ */

// ---- WMO weather-code -> short label -----------------------
function wmoLabel(c) {
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Rain showers';
  if (c >= 85 && c <= 86) return 'Snow showers';
  if (c >= 95) return 'Thunderstorm';
  return 'Clear';
}
function wmoIcon(c, day) {
  if (c === 0) return day ? '☀️' : '🌙';
  if (c <= 2) return day ? '🌤️' : '☁️';
  if (c === 3) return '☁️';
  if (c === 45 || c === 48) return '🌫️';
  if (c >= 51 && c <= 67) return '🌧️';
  if (c >= 71 && c <= 77) return '❄️';
  if (c >= 80 && c <= 82) return '🌦️';
  if (c >= 85 && c <= 86) return '🌨️';
  if (c >= 95) return '⛈️';
  return '🌤️';
}

// ---- translate the current reading into visual targets ------
function applyWeatherVisuals() {
  const c = weather.code, day = weather.isDay;
  let top, bot, precip = 'none', storm = false, fog = false;

  const clearD = [[126, 200, 232], [221, 238, 207]];
  const clearN = [[11, 22, 52], [26, 42, 74]];
  const cloudD = [[150, 168, 182], [201, 208, 200]];
  const cloudN = [[22, 30, 46], [42, 50, 62]];
  const rainD  = [[108, 122, 138], [150, 160, 160]];
  const rainN  = [[16, 22, 34], [30, 38, 52]];
  const snowD  = [[190, 205, 220], [227, 233, 236]];
  const snowN  = [[40, 50, 66], [70, 80, 96]];
  const fogD   = [[178, 184, 188], [202, 205, 203]];
  const stormD = [[70, 78, 92], [98, 104, 112]];
  const stormN = [[12, 16, 26], [24, 30, 44]];

  if (c === 0 || c <= 2)      { [top, bot] = day ? clearD : clearN; }
  else if (c === 3)           { [top, bot] = day ? cloudD : cloudN; }
  else if (c === 45 || c === 48) { [top, bot] = day ? fogD : cloudN; fog = true; }
  else if (c >= 71 && c <= 77) { [top, bot] = day ? snowD : snowN; precip = 'snow'; }
  else if (c >= 85 && c <= 86) { [top, bot] = day ? snowD : snowN; precip = 'snow'; }
  else if (c >= 95)           { [top, bot] = day ? stormD : stormN; precip = 'rain'; storm = true; }
  else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) { [top, bot] = day ? rainD : rainN; precip = 'rain'; }
  else                        { [top, bot] = day ? clearD : clearN; }

  weather.sky.topT = top; weather.sky.botT = bot;
  weather.precipType = precip; weather.storm = storm; weather.fog = fog;

  // real wind speed -> grass sway baseline
  wind.base = clamp((weather.windKmh || 8) * 0.42, 2.5, 20) + (storm ? 6 : 0);
}

// ---- fetch current conditions for a lat/lon ----------------
function fetchWeatherByCoords(lat, lon, placeName) {
  weather.status = 'loading';
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
              '&longitude=' + lon +
              '&current=temperature_2m,weather_code,wind_speed_10m,precipitation,is_day' +
              '&temperature_unit=fahrenheit&wind_speed_unit=kmh';
  fetch(url)
    .then(r => r.json())
    .then(d => {
      const cur = d && d.current;
      if (!cur) throw new Error('no current');
      weather.code    = cur.weather_code | 0;
      weather.isDay   = cur.is_day | 0;
      weather.windKmh = +cur.wind_speed_10m || 0;
      weather.tempF   = Math.round(+cur.temperature_2m);
      weather.precip  = +cur.precipitation || 0;
      weather.label   = wmoLabel(weather.code);
      if (placeName) weather.place = placeName;
      weather.status  = 'ok';
      applyWeatherVisuals();
      banner = { text: wmoIcon(weather.code, weather.isDay) + '  ' + weather.label +
                 (weather.tempF != null ? '  ' + weather.tempF + '°F' : '') +
                 (weather.place ? '  ·  ' + weather.place : ''), t: 3.2 };
    })
    .catch(() => { weather.status = 'error'; banner = { text: '⚠️ Weather unavailable', t: 2.6 }; });
}

// ---- US ZIP -> coords via Zippopotam.us --------------------
function fetchWeatherByZip(zip) {
  weather.status = 'loading';
  fetch('https://api.zippopotam.us/us/' + encodeURIComponent(zip))
    .then(r => { if (!r.ok) throw new Error('bad zip'); return r.json(); })
    .then(d => {
      const p = d && d.places && d.places[0];
      if (!p) throw new Error('no place');
      const name = p['place name'] + ', ' + p['state abbreviation'];
      fetchWeatherByCoords(p.latitude, p.longitude, name);
    })
    .catch(() => { weather.status = 'error'; banner = { text: '⚠️ ZIP not found', t: 2.6 }; });
}

// ---- entry point: try GPS, fall back to ZIP prompt ---------
function requestWeather() {
  const askZip = () => {
    let zip = null;
    try { zip = window.prompt('Enter US ZIP code for live weather:'); } catch (e) { zip = null; }
    if (zip && /^\d{5}$/.test(zip.trim())) fetchWeatherByZip(zip.trim());
  };
  if (navigator.geolocation) {
    weather.status = 'loading';
    banner = { text: '📍 Getting your weather…', t: 2.0 };
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude, ''),
      ()  => askZip(),
      { timeout: 8000, maximumAge: 600000 }
    );
  } else {
    askZip();
  }
}

// ---- per-frame: ease sky, run precipitation + lightning ----
function updateWeather(dt) {
  // ease sky colours toward targets
  const s = weather.sky;
  for (let i = 0; i < 3; i++) {
    s.top[i] += (s.topT[i] - s.top[i]) * Math.min(1, dt * 1.5);
    s.bot[i] += (s.botT[i] - s.bot[i]) * Math.min(1, dt * 1.5);
  }

  // precipitation particles live in SCREEN space (fall regardless of camera)
  if (weather.precipType === 'rain') {
    const want = weather.storm ? 220 : 130;
    while (weather.rain.length < want) weather.rain.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 12, spd: 9 + Math.random() * 7 });
    const lean = wind.strength * 0.5;
    for (const d of weather.rain) {
      d.y += d.spd; d.x += lean;
      if (d.y > H) { d.y = -d.len; d.x = Math.random() * W; }
      if (d.x > W) d.x -= W; if (d.x < 0) d.x += W;
    }
    weather.snow.length = 0;
  } else if (weather.precipType === 'snow') {
    const want = 120;
    while (weather.snow.length < want) weather.snow.push({ x: Math.random() * W, y: Math.random() * H, r: 1.2 + Math.random() * 2.2, spd: 0.7 + Math.random() * 1.1, ph: Math.random() * 6.28 });
    for (const f of weather.snow) {
      f.y += f.spd; f.x += Math.sin((t + f.ph) * 1.2) * 0.6 + wind.strength * 0.06;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
      if (f.x > W) f.x -= W; if (f.x < 0) f.x += W;
    }
    weather.rain.length = 0;
  } else {
    if (weather.rain.length) weather.rain.length = 0;
    if (weather.snow.length) weather.snow.length = 0;
  }

  // lightning flashes during storms
  if (weather.storm) {
    weather.flashT -= dt;
    if (weather.flashT <= 0) { weather.flashT = 3 + Math.random() * 6; weather.flash = 1; }
  }
  if (weather.flash > 0) weather.flash = Math.max(0, weather.flash - dt * 3.2);
}
