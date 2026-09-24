/* ───────────────────────────────────────────────────
   ATMOSPHERE — demo-data.js
   Built-in demo weather source. Produces deterministic
   OpenWeatherMap-shaped payloads so the full dashboard
   (canvas panels included) runs without any network.
   ─────────────────────────────────────────────────── */

const CONDITION_SETS = [
  { main: 'Clear',        description: 'clear sky',         iconDay: '01d', iconNight: '01n' },
  { main: 'Clouds',       description: 'scattered clouds',  iconDay: '03d', iconNight: '03n' },
  { main: 'Clouds',       description: 'overcast clouds',   iconDay: '04d', iconNight: '04n' },
  { main: 'Rain',         description: 'light rain',        iconDay: '10d', iconNight: '10n' },
  { main: 'Drizzle',      description: 'light drizzle',     iconDay: '09d', iconNight: '09n' },
  { main: 'Thunderstorm', description: 'thunderstorm',      iconDay: '11d', iconNight: '11n' },
  { main: 'Snow',         description: 'light snow',        iconDay: '13d', iconNight: '13n' },
  { main: 'Mist',         description: 'mist',              iconDay: '50d', iconNight: '50n' },
];

const COUNTRY_BY_LETTER = ['US', 'GB', 'FR', 'DE', 'JP', 'CN', 'AU', 'BR', 'IN', 'CA'];

function hashCity(city) {
  const text = String(city || 'demo').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function capitalize(text) {
  return String(text || 'Demo City').trim().replace(/\b\w/g, c => c.toUpperCase()) || 'Demo City';
}

/**
 * Build a full OpenWeatherMap-shaped dataset for a city.
 * Deterministic per city name; values drift slowly with the
 * time of day so repeated demo loads feel alive.
 *
 * @param {string} city
 * @param {number} [now] Epoch milliseconds (injectable for tests).
 */
export function buildDemoWeather(city, now = Date.now()) {
  const seed = hashCity(city);
  const nowSec = Math.floor(now / 1000);
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const dayCurve = Math.sin(((hour - 9) / 24) * Math.PI * 2); // warmest mid-afternoon

  const baseTemp = 8 + (seed % 180) / 10;           // 8°C – 25.9°C per city
  const temp = Math.round((baseTemp + dayCurve * 4) * 10) / 10;
  const condition = CONDITION_SETS[seed % CONDITION_SETS.length];
  const isNight = hour < 6 || hour >= 20;
  const icon = isNight ? condition.iconNight : condition.iconDay;

  const lat = Math.round((((seed % 12000) / 100) - 60) * 100) / 100;
  const lon = Math.round(((((seed >> 7) % 36000) / 100) - 180) * 100) / 100;
  const sunrise = nowSec - Math.floor(((hour - 6.2) % 24) * 3600);
  const sunset = nowSec + Math.floor(((19.8 - hour + 24) % 24) * 3600);

  const humidity = 35 + (seed % 55);
  const windMs = Math.round(((seed % 90) / 10 + 1) * 10) / 10;
  const windDeg = seed % 360;
  const pressure = 1000 + (seed % 25);
  const visibility = 6000 + (seed % 4000);

  const current = {
    coord: { lat, lon },
    weather: [{ id: 800 + (seed % 4), main: condition.main, description: condition.description, icon }],
    main: {
      temp,
      feels_like: Math.round((temp - windMs * 0.7) * 10) / 10,
      temp_min: Math.round((temp - 3) * 10) / 10,
      temp_max: Math.round((temp + 3) * 10) / 10,
      pressure,
      humidity,
    },
    visibility,
    wind: { speed: windMs, deg: windDeg, gust: Math.round(windMs * 1.6 * 10) / 10 },
    clouds: { all: seed % 100 },
    dt: nowSec,
    sys: {
      country: COUNTRY_BY_LETTER[seed % COUNTRY_BY_LETTER.length],
      sunrise,
      sunset,
    },
    timezone: ((seed % 25) - 12) * 3600,
    name: capitalize(city),
  };

  const list = [];
  for (let i = 0; i < 40; i += 1) {
    const slotHour = (hour + i * 3) % 24;
    const slotCurve = Math.sin(((slotHour - 9) / 24) * Math.PI * 2);
    const slotCondition = CONDITION_SETS[(seed + Math.floor(i / 8)) % CONDITION_SETS.length];
    const slotNight = slotHour < 6 || slotHour >= 20;
    list.push({
      dt: nowSec + i * 3 * 3600,
      main: {
        temp: Math.round((baseTemp + slotCurve * 4 - i * 0.05) * 10) / 10,
        feels_like: Math.round((baseTemp + slotCurve * 4 - 1) * 10) / 10,
        temp_min: Math.round((baseTemp + slotCurve * 4 - 2) * 10) / 10,
        temp_max: Math.round((baseTemp + slotCurve * 4 + 2) * 10) / 10,
        pressure: pressure + (i % 5) - 2,
        humidity: Math.min(100, humidity + (i % 7) * 2),
      },
      weather: [{
        id: 800 + ((seed + i) % 4),
        main: slotCondition.main,
        description: slotCondition.description,
        icon: slotNight ? slotCondition.iconNight : slotCondition.iconDay,
      }],
      wind: { speed: Math.round((windMs + (i % 4) * 0.5) * 10) / 10, deg: (windDeg + i * 9) % 360 },
      pop: Math.round(((seed + i * 13) % 60) / 100 * 100) / 100,
      visibility,
    });
  }

  const forecast = {
    list,
    city: {
      name: current.name,
      coord: { lat, lon },
      country: current.sys.country,
      timezone: current.timezone,
      sunrise,
      sunset,
    },
  };

  const aqi = 1 + (seed % 5);
  const airQuality = {
    list: [{
      main: { aqi },
      components: {
        pm2_5: Math.round((seed % 200) / 10 * 10) / 10,
        pm10: Math.round((seed % 400) / 10 * 10) / 10,
        no2: Math.round((seed % 300) / 10 * 10) / 10,
        o3: Math.round((seed % 900) / 10 * 10) / 10,
        so2: Math.round((seed % 150) / 10 * 10) / 10,
        co: 150 + (seed % 300),
      },
      dt: nowSec,
    }],
  };

  const uv = { value: Math.round(Math.max(0, dayCurve) * 90) / 10 + (seed % 3) };

  return { current, forecast, airQuality, uv };
}
