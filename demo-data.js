/* ═══════════════════════════════════════════════════
   ATMOSPHERE — demo-data.js
   Deterministic, offline demo weather generator.
   Produces OpenWeatherMap-shaped payloads so the existing
   canvas panels render without any network access.
   ═══════════════════════════════════════════════════ */

const CONDITIONS = [
  { id: 800, main: 'Clear',        description: 'clear sky',       icon: '01d' },
  { id: 801, main: 'Clouds',       description: 'few clouds',      icon: '02d' },
  { id: 803, main: 'Clouds',       description: 'broken clouds',   icon: '04d' },
  { id: 500, main: 'Rain',         description: 'light rain',      icon: '10d' },
  { id: 701, main: 'Mist',         description: 'mist',            icon: '50d' },
  { id: 600, main: 'Snow',         description: 'light snow',      icon: '13d' },
  { id: 802, main: 'Clouds',       description: 'scattered clouds',icon: '03d' },
  { id: 200, main: 'Thunderstorm', description: 'thunderstorm with light rain', icon: '11d' },
];

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a full OpenWeatherMap-shaped demo dataset for a city name.
// Deterministic per city + hour so repeated loads stay stable.
export function buildDemoWeather(city, now = Date.now()) {
  const name = String(city || 'Demo City').trim() || 'Demo City';
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const hourBucket = Math.floor(now / 3600000);
  const rand = mulberry32(hashString(displayName.toLowerCase()) ^ hourBucket);

  const nowSec = Math.floor(now / 1000);
  const baseTemp = Math.round((rand() * 28 - 6) * 10) / 10; // -6°C … 22°C
  const condition = CONDITIONS[Math.floor(rand() * CONDITIONS.length)];
  const humidity = Math.round(30 + rand() * 60);
  const windMs = Math.round(rand() * 12 * 10) / 10;
  const windDeg = Math.floor(rand() * 360);
  const pressure = Math.round(995 + rand() * 40);
  const visibility = Math.round((4 + rand() * 6) * 1000);

  const dayStart = nowSec - (nowSec % 86400);
  const sunrise = dayStart + 6 * 3600 + Math.floor(rand() * 3600);
  const sunset = dayStart + 17 * 3600 + Math.floor(rand() * 3600);

  const currentWeather = {
    coord: { lat: Math.round((rand() * 120 - 60) * 100) / 100, lon: Math.round((rand() * 300 - 150) * 100) / 100 },
    weather: [{ ...condition }],
    main: {
      temp: baseTemp,
      feels_like: Math.round((baseTemp - rand() * 3) * 10) / 10,
      temp_min: Math.round((baseTemp - 3 - rand() * 2) * 10) / 10,
      temp_max: Math.round((baseTemp + 3 + rand() * 2) * 10) / 10,
      pressure,
      humidity,
    },
    visibility,
    wind: { speed: windMs, deg: windDeg },
    clouds: { all: Math.round(rand() * 100) },
    dt: nowSec,
    sys: { country: 'DM', sunrise, sunset },
    timezone: 0,
    name: displayName,
  };

  const list = [];
  for (let i = 0; i < 40; i++) {
    const dt = nowSec + i * 3 * 3600;
    const diurnal = Math.sin(((dt % 86400) / 86400) * Math.PI * 2 - Math.PI / 2) * 4;
    const drift = (rand() - 0.5) * 3;
    const itemCondition = rand() < 0.7 ? condition : CONDITIONS[Math.floor(rand() * CONDITIONS.length)];
    list.push({
      dt,
      main: {
        temp: Math.round((baseTemp + diurnal + drift) * 10) / 10,
        feels_like: Math.round((baseTemp + diurnal + drift - 1) * 10) / 10,
        pressure: pressure + Math.round((rand() - 0.5) * 8),
        humidity: Math.min(100, Math.max(20, humidity + Math.round((rand() - 0.5) * 20))),
      },
      weather: [{ ...itemCondition }],
      wind: { speed: Math.round((windMs + (rand() - 0.5) * 4) * 10) / 10, deg: (windDeg + Math.floor(rand() * 60)) % 360 },
      pop: Math.round(rand() * 100) / 100,
      dt_txt: new Date(dt * 1000).toISOString().replace('T', ' ').slice(0, 19),
    });
  }

  const forecast = {
    list,
    city: { name: displayName, country: 'DM', timezone: 0, sunrise, sunset },
  };

  const aqi = 1 + Math.floor(rand() * 4);
  const airQuality = {
    list: [{
      main: { aqi },
      components: {
        pm2_5: Math.round(rand() * 30 * 10) / 10,
        pm10: Math.round(rand() * 50 * 10) / 10,
        no2: Math.round(rand() * 40 * 10) / 10,
        o3: Math.round(rand() * 120 * 10) / 10,
        so2: Math.round(rand() * 20 * 10) / 10,
        co: Math.round(rand() * 800 * 10) / 10,
      },
    }],
  };

  const uv = { value: Math.round(rand() * 10 * 10) / 10 };

  return { timestamp: now, currentWeather, forecast, airQuality, uv };
}
