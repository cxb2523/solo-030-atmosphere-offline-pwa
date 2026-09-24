/* ───────────────────────────────────────────────────
   ATMOSPHERE — cache.js
   Pure localStorage cache helpers for weather payloads.
   No DOM access here so the logic stays unit-testable.
   ─────────────────────────────────────────────────── */

export const CACHE_PREFIX = 'wv_cache_';
export const CACHE_TTL_MS = 30 * 60 * 1000; // entries are "fresh" for 30 minutes

export function cacheKeyFor(city) {
  return `${CACHE_PREFIX}${String(city).toLowerCase().replace(/\s+/g, '_')}`;
}

export function writeCache(storage, city, data, now = Date.now()) {
  const entry = { timestamp: now, ...data };
  try {
    storage.setItem(cacheKeyFor(city), JSON.stringify(entry));
  } catch {}
  return entry;
}

export function readCache(storage, city, now = Date.now()) {
  let entry = null;
  try {
    const raw = storage.getItem(cacheKeyFor(city));
    entry = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!entry || typeof entry.timestamp !== 'number') return null;
  const ageMs = Math.max(0, now - entry.timestamp);
  return { entry, ageMs, fresh: ageMs <= CACHE_TTL_MS };
}

export function clearWeatherCaches(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
  return keys.length;
}

export function formatCacheAge(ageMs) {
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
