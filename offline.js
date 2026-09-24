/* ═══════════════════════════════════════════════════
   ATMOSPHERE — offline.js
   Pure cache and data-source logic (no DOM access).
   Imported by app.js and unit-tested by tests/offline.test.mjs.
   ═══════════════════════════════════════════════════ */

export const CACHE_TTL_MS = 30 * 60 * 1000; // entries younger than this are "fresh"
export const CACHE_KEY_PREFIX = 'wv_cache_';
export const DATA_SOURCE_MODES = ['auto', 'live', 'demo'];

export function cacheKeyFor(city) {
  return `${CACHE_KEY_PREFIX}${String(city).toLowerCase().replace(/\s+/g, '_')}`;
}

export function readCacheEntry(storage, city, now = Date.now()) {
  try {
    const raw = storage.getItem(cacheKeyFor(city));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.timestamp !== 'number') return null;
    const ageMs = Math.max(0, now - entry.timestamp);
    return {
      ...entry,
      ageMs,
      fresh: ageMs < CACHE_TTL_MS,
      stale: ageMs >= CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function writeCacheEntry(storage, city, data, now = Date.now()) {
  try {
    storage.setItem(cacheKeyFor(city), JSON.stringify({ timestamp: now, ...data }));
    return true;
  } catch {
    return false;
  }
}

export function clearWeatherCache(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
  return keys.length;
}

export function normalizeDataSourceMode(mode) {
  return DATA_SOURCE_MODES.includes(mode) ? mode : 'auto';
}

// Decide whether the demo data source should serve this request.
//  - 'demo'  → always demo
//  - 'live'  → never demo
//  - 'auto'  → demo only when live data is unavailable
export function shouldUseDemoData(mode, liveDataUnavailable = false) {
  const normalized = normalizeDataSourceMode(mode);
  if (normalized === 'demo') return true;
  if (normalized === 'live') return false;
  return Boolean(liveDataUnavailable);
}

export function describeCacheAge(timestamp, now = Date.now()) {
  if (!timestamp || typeof timestamp !== 'number') {
    return { ageMs: null, minutes: null, label: 'unknown age', stale: true };
  }
  const ageMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(ageMs / 60000);
  let label;
  if (minutes < 1) label = 'just now';
  else if (minutes < 60) label = `${minutes} min ago`;
  else {
    const hours = Math.floor(minutes / 60);
    label = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  return { ageMs, minutes, label, stale: ageMs >= CACHE_TTL_MS };
}

// Text for the on-page data-source badge: live vs cached vs demo, with age.
export function dataSourceBadgeText(source, timestamp, now = Date.now()) {
  const age = describeCacheAge(timestamp, now);
  if (source === 'demo') return `Demo data · generated ${age.label}`;
  if (source === 'cache') return `Cached data · from ${age.label}`;
  return `Live data · updated ${age.label}`;
}
