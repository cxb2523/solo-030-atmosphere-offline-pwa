/* ───────────────────────────────────────────────────
   ATMOSPHERE — data-source.js
   Pure decision logic for where weather data comes from
   (live API, local cache, or the built-in demo source).
   Kept DOM-free so it can be unit-tested in Node.
   ─────────────────────────────────────────────────── */

export const DATA_SOURCES = ['live', 'cache', 'demo'];

/**
 * Decide how a city load should be satisfied.
 *
 * @param {object} input
 * @param {boolean} input.demoMode   Demo data source enabled in settings.
 * @param {boolean} input.online     Navigator online state.
 * @param {boolean} input.hasApiKey  A usable OpenWeatherMap key is configured.
 * @param {object|null} input.cache  Result of readCache(): { fresh } or null.
 * @returns {{ plan: 'live'|'cache'|'demo'|'error', reason: string }}
 */
export function resolveFetchPlan({ demoMode, online, hasApiKey, cache }) {
  if (demoMode) return { plan: 'demo', reason: 'demo_mode_enabled' };
  if (!online) {
    return cache
      ? { plan: 'cache', reason: 'offline' }
      : { plan: 'error', reason: 'offline_no_cache' };
  }
  if (!hasApiKey) {
    return cache
      ? { plan: 'cache', reason: 'no_api_key' }
      : { plan: 'error', reason: 'no_api_key' };
  }
  return { plan: 'live', reason: 'online' };
}

/**
 * Decide what to do after a live fetch failed.
 * Any cached entry — fresh or expired — is used as a fallback,
 * but expired entries are flagged stale so the UI can say so.
 *
 * @param {object|null} cache Result of readCache(): { fresh } or null.
 * @returns {{ plan: 'cache'|'error', stale: boolean }}
 */
export function resolveFetchFailure(cache) {
  if (cache) return { plan: 'cache', stale: !cache.fresh };
  return { plan: 'error', stale: false };
}

/**
 * Human-readable badge text for the current data source.
 *
 * @param {'live'|'cache'|'demo'} source
 * @param {number|null} ageMs Age of the underlying data, when known.
 * @param {(ageMs: number) => string} formatAge
 */
export function describeDataSource(source, ageMs, formatAge) {
  const age = typeof ageMs === 'number' && formatAge ? formatAge(ageMs) : null;
  if (source === 'demo') return { label: 'Demo data', detail: 'Built-in demo source — no network needed' };
  if (source === 'cache') {
    return {
      label: 'Cached data',
      detail: age ? `Cached ${age}` : 'Cached data',
    };
  }
  return { label: 'Live data', detail: age ? `Updated ${age}` : 'Live data' };
}
