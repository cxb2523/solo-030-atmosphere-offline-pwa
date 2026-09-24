import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CACHE_TTL_MS,
  cacheKeyFor,
  readCacheEntry,
  writeCacheEntry,
  clearWeatherCache,
  normalizeDataSourceMode,
  shouldUseDemoData,
  describeCacheAge,
  dataSourceBadgeText,
} from '../offline.js';
import { buildDemoWeather } from '../demo-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function createStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

test('cache hit: a freshly written entry is returned fresh with its payload', () => {
  const storage = createStorage();
  const now = Date.now();
  const payload = { currentWeather: { name: 'Paris' }, forecast: { list: [] }, airQuality: null, uv: null };

  assert.equal(writeCacheEntry(storage, 'Paris', payload, now), true);
  const entry = readCacheEntry(storage, 'Paris', now + 5 * 60 * 1000);

  assert.ok(entry, 'expected a cache hit');
  assert.equal(entry.currentWeather.name, 'Paris');
  assert.equal(entry.timestamp, now);
  assert.equal(entry.fresh, true);
  assert.equal(entry.stale, false);
  assert.equal(cacheKeyFor('New York'), 'wv_cache_new_york');
});

test('cache miss: unknown city or corrupt JSON returns null', () => {
  const storage = createStorage();
  assert.equal(readCacheEntry(storage, 'Nowhere'), null);
  storage.setItem(cacheKeyFor('Broken'), '{not json');
  assert.equal(readCacheEntry(storage, 'Broken'), null);
});

test('stale cache: expired entry is flagged stale but still usable as fallback', () => {
  const storage = createStorage();
  const now = Date.now();
  writeCacheEntry(storage, 'Oslo', { currentWeather: { name: 'Oslo' } }, now);

  const later = now + CACHE_TTL_MS + 60 * 1000;
  const entry = readCacheEntry(storage, 'Oslo', later);

  assert.ok(entry, 'stale entry must still be returned for fallback');
  assert.equal(entry.fresh, false);
  assert.equal(entry.stale, true);
  assert.equal(entry.currentWeather.name, 'Oslo');

  const age = describeCacheAge(entry.timestamp, later);
  assert.equal(age.stale, true);
  assert.match(age.label, /ago/);
});

test('clearWeatherCache removes only weather cache entries', () => {
  const storage = createStorage();
  writeCacheEntry(storage, 'Berlin', { currentWeather: {} });
  writeCacheEntry(storage, 'Madrid', { currentWeather: {} });
  storage.setItem('wv_settings', '{"unit":"C"}');

  assert.equal(clearWeatherCache(storage), 2);
  assert.equal(readCacheEntry(storage, 'Berlin'), null);
  assert.equal(storage.getItem('wv_settings'), '{"unit":"C"}');
});

test('data source switching: live/demo/auto modes resolve correctly', () => {
  assert.equal(normalizeDataSourceMode('demo'), 'demo');
  assert.equal(normalizeDataSourceMode('live'), 'live');
  assert.equal(normalizeDataSourceMode('bogus'), 'auto');

  // Explicit demo mode always serves demo data.
  assert.equal(shouldUseDemoData('demo', false), true);
  // Live-only mode never falls back to demo data.
  assert.equal(shouldUseDemoData('live', true), false);
  // Auto mode falls back to demo only when live data is unavailable.
  assert.equal(shouldUseDemoData('auto', true), true);
  assert.equal(shouldUseDemoData('auto', false), false);
});

test('demo data source generates OpenWeatherMap-shaped payloads offline', () => {
  const now = Date.now();
  const demo = buildDemoWeather('London', now);

  assert.equal(demo.timestamp, now);
  assert.equal(demo.currentWeather.name, 'London');
  assert.equal(typeof demo.currentWeather.main.temp, 'number');
  assert.equal(typeof demo.currentWeather.main.feels_like, 'number');
  assert.ok(demo.currentWeather.weather[0].icon);
  assert.ok(demo.currentWeather.sys.sunrise < demo.currentWeather.sys.sunset);
  assert.equal(demo.forecast.list.length, 40);
  assert.equal(typeof demo.forecast.list[0].main.temp, 'number');
  assert.ok(demo.airQuality.list[0].main.aqi >= 1 && demo.airQuality.list[0].main.aqi <= 5);
  assert.equal(typeof demo.uv.value, 'number');

  // Deterministic for the same city within the same hour bucket.
  const again = buildDemoWeather('London', now + 60 * 1000);
  assert.equal(again.currentWeather.main.temp, demo.currentWeather.main.temp);
});

test('data-source badge text distinguishes live, cached, and demo data with age', () => {
  const now = Date.now();
  assert.match(dataSourceBadgeText('live', now, now), /^Live data · updated just now$/);
  assert.match(dataSourceBadgeText('cache', now - 10 * 60000, now), /^Cached data · from 10 min ago$/);
  assert.match(dataSourceBadgeText('demo', now, now), /^Demo data · generated just now$/);
});

test('refresh button semantics: labeled control, disabled while loading, re-enabled after', () => {
  const html = read('index.html');
  const app = read('app.js');

  // The refresh control is an accessible button with an explicit label.
  assert.match(html, /<button id="refresh-btn"[^>]*aria-label="Refresh weather data"/);

  // It is disabled while a load is in flight and re-enabled afterwards.
  assert.match(app, /refreshButton\.disabled = true/);
  assert.match(app, /refreshButton\.disabled = false/);

  // Clicking it re-runs the current city load and announces the refresh.
  assert.match(app, /function initRefreshButton\(\)/);
  assert.match(app, /announce\('Refreshing weather data\.'\)/);
});

test('offline UI affordances are wired: badge, demo toggle, and clear-cache entry', () => {
  const html = read('index.html');
  const app = read('app.js');

  for (const id of ['data-source-badge', 'welcome-demo-data-btn', 'clear-cache-btn']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /data-setting="dataSource" data-value="demo"/);
  assert.match(app, /function renderDataSourceBadge\(\)/);
  assert.match(app, /function applyDemoData\(city\)/);
  assert.match(app, /function clearCachedWeather\(\)/);
  assert.match(app, /from '\.\/offline\.js'/);
  assert.match(app, /from '\.\/demo-data\.js'/);
});

test('service worker caches the app shell and falls back to cached API responses', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /caches\.open\(CACHE_NAME\)/);
  assert.match(sw, /DATA_CACHE_NAME/);
  assert.match(sw, /api\.openweathermap\.org/);
  assert.match(sw, /networkFirst/);
  assert.match(sw, /caches\.match\(request\)/);
});
