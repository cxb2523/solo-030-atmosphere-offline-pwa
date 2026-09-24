import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCache, writeCache, clearWeatherCaches, formatCacheAge, CACHE_TTL_MS } from '../cache.js';
import { resolveFetchPlan, resolveFetchFailure, describeDataSource } from '../data-source.js';
import { buildDemoWeather } from '../demo-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function createStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}

test('new local-first controls are present in the document', () => {
  const html = read('index.html');
  for (const id of [
    'welcome-state',
    'welcome-demo-btn',
    'welcome-location-btn',
    'refresh-btn',
    'favorite-btn',
    'favorite-cities',
    'export-data-btn',
    'import-data-input',
    'reset-data-btn',
    'copy-link-btn',
    'native-share-btn',
    'sr-status'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('PWA assets are valid and linked', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  const serviceWorker = read('public/sw.js');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.equal(manifest.short_name, 'Atmosphere');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons[0].src, '/icon.svg');
  assert.match(serviceWorker, /caches\.open\(SHELL_CACHE\)/);
  assert.match(serviceWorker, /event\.respondWith/);
  assert.match(serviceWorker, /CLEAR_CACHES/);
  assert.match(serviceWorker, /api\.openweathermap\.org/);
});

test('free feature wiring is present in the application', () => {
  const app = read('app.js');
  for (const marker of [
    'function renderFavorites()',
    'function exportLocalData()',
    'function importLocalData(file)',
    'function resetLocalData()',
    'function loadCityFromShareLink()',
    'navigator.share',
    'navigator.serviceWorker.register',
    "theme === 'system'"
  ]) {
    assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${marker}`);
  }
});

test('weather cache hit returns a fresh entry with its age', () => {
  const storage = createStorage();
  const now = Date.now();
  writeCache(storage, 'Berlin', { currentWeather: { name: 'Berlin' } }, now);

  const hit = readCache(storage, 'Berlin', now + 5 * 60 * 1000);
  assert.ok(hit, 'expected a cache hit');
  assert.equal(hit.entry.currentWeather.name, 'Berlin');
  assert.equal(hit.fresh, true);
  assert.equal(hit.ageMs, 5 * 60 * 1000);
});

test('expired cache entry is flagged stale so the app can fall back to it', () => {
  const storage = createStorage();
  const now = Date.now();
  writeCache(storage, 'Oslo', { currentWeather: { name: 'Oslo' } }, now);

  const expired = readCache(storage, 'Oslo', now + CACHE_TTL_MS + 1000);
  assert.ok(expired, 'expired entries are still readable as a fallback');
  assert.equal(expired.fresh, false);

  const failure = resolveFetchFailure(expired);
  assert.equal(failure.plan, 'cache', 'failed live fetch falls back to expired cache');
  assert.equal(failure.stale, true, 'expired fallback is marked stale');

  const freshFailure = resolveFetchFailure(readCache(storage, 'Oslo', now + 1000));
  assert.equal(freshFailure.plan, 'cache');
  assert.equal(freshFailure.stale, false);

  const noCache = resolveFetchFailure(readCache(storage, 'Reykjavik', now));
  assert.equal(noCache.plan, 'error');
});

test('clearing weather caches only removes wv_cache_ keys', () => {
  const storage = createStorage();
  writeCache(storage, 'Paris', { currentWeather: {} });
  writeCache(storage, 'Madrid', { currentWeather: {} });
  storage.setItem('wv_settings', '{"unit":"C"}');

  const removed = clearWeatherCaches(storage);
  assert.equal(removed, 2);
  assert.equal(readCache(storage, 'Paris'), null);
  assert.equal(storage.getItem('wv_settings'), '{"unit":"C"}');
});

test('fetch plan prefers demo mode, then offline cache, then live', () => {
  const cache = { fresh: true };
  assert.equal(resolveFetchPlan({ demoMode: true, online: true, hasApiKey: true, cache }).plan, 'demo');
  assert.equal(resolveFetchPlan({ demoMode: false, online: false, hasApiKey: true, cache }).plan, 'cache');
  assert.equal(resolveFetchPlan({ demoMode: false, online: false, hasApiKey: true, cache: null }).plan, 'error');
  assert.equal(resolveFetchPlan({ demoMode: false, online: true, hasApiKey: false, cache }).plan, 'cache');
  assert.equal(resolveFetchPlan({ demoMode: false, online: true, hasApiKey: true, cache: null }).plan, 'live');
});

test('demo data source produces deterministic OpenWeatherMap-shaped payloads', () => {
  const now = 1_700_000_000_000;
  const a = buildDemoWeather('London', now);
  const b = buildDemoWeather('London', now);
  const other = buildDemoWeather('Tokyo', now);

  assert.deepEqual(a, b, 'same city and time gives the same demo payload');
  assert.notEqual(a.current.main.temp, other.current.main.temp, 'different cities differ');

  assert.equal(a.current.name, 'London');
  assert.ok(a.current.weather[0].description);
  assert.equal(typeof a.current.main.temp, 'number');
  assert.equal(typeof a.current.sys.sunrise, 'number');
  assert.equal(a.forecast.list.length, 40);
  assert.ok(a.forecast.list.every(item => typeof item.dt === 'number' && item.weather[0].icon));
  assert.ok(a.airQuality.list[0].main.aqi >= 1 && a.airQuality.list[0].main.aqi <= 5);
  assert.equal(typeof a.uv.value, 'number');
});

test('data source badge copy distinguishes live, cached, and demo data', () => {
  assert.equal(describeDataSource('live', 0, formatCacheAge).label, 'Live data');
  const cached = describeDataSource('cache', 10 * 60 * 1000, formatCacheAge);
  assert.equal(cached.label, 'Cached data');
  assert.match(cached.detail, /10 min ago/);
  assert.equal(describeDataSource('demo', null, formatCacheAge).label, 'Demo data');
});

test('demo data source toggle and clear-cache entry are wired up', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /data-setting="dataSource" data-value="demo"/);
  assert.match(html, /data-setting="dataSource" data-value="live"/);
  assert.match(html, /id="clear-cache-btn"/);
  assert.match(html, /id="data-source-badge"/);
  assert.match(app, /buildDemoWeather/);
  assert.match(app, /function loadDemoCity\(city\)/);
  assert.match(app, /function initClearCacheButton\(\)/);
  assert.match(app, /clearWeatherCaches\(localStorage\)/);
});

test('refresh button semantics: labelled, refetches current city, locked while loading', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /id="refresh-btn"[^>]*aria-label="Refresh weather data"/);
  assert.match(app, /function initRefreshButton\(\)/);
  assert.match(app, /searchCity\(STATE\.city\);\s*\n\s*announce\('Refreshing weather data\.'\)/);
  // disabled while a load is in flight and always re-enabled afterwards
  assert.match(app, /refreshButton\.disabled = true/);
  assert.match(app, /finally \{[\s\S]*?refreshButton\.disabled = false/);
});
