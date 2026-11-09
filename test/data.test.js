'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadLogic } = require('./extract');

const CATS = ['iconic', 'museums', 'parks', 'food', 'neighborhoods', 'shows', 'hidden', 'free', 'date'];
const BUD = ['free', '$', '$$', '$$$'];
const TIME = ['quick', 'half', 'full'];
const MOODS = ['chill', 'adventurous', 'romantic', 'foodie', 'artsy', 'touristy', 'outdoorsy', 'lively'];

test('seed has 200+ well-formed items with unique ids', () => {
  const { SEED } = loadLogic();
  assert.ok(SEED.length >= 200, 'seed too small: ' + SEED.length);
  const ids = new Set();
  for (const it of SEED) {
    assert.ok(it.id && !ids.has(it.id), 'dup or missing id: ' + it.id);
    ids.add(it.id);
    assert.ok(Array.isArray(it.categories) && it.categories.length >= 1, 'categories on ' + it.id);
    for (const c of it.categories) assert.ok(CATS.includes(c), 'bad category ' + c + ' on ' + it.id);
    assert.ok(BUD.includes(it.budget), 'bad budget on ' + it.id + ': ' + it.budget);
    assert.ok(TIME.includes(it.time), 'bad time on ' + it.id + ': ' + it.time);
    assert.ok(Array.isArray(it.moods) && it.moods.length >= 1, 'moods on ' + it.id);
    for (const m of it.moods) assert.ok(MOODS.includes(m), 'bad mood ' + m + ' on ' + it.id);
    assert.ok(it.name && it.emoji && it.area && it.blurb, 'missing field on ' + it.id);
  }
});

test('names are unique after normalization (dedup invariant)', () => {
  const { SEED, normalizeKey } = loadLogic();
  const keys = new Set();
  for (const it of SEED) {
    const k = normalizeKey(it.name);
    assert.ok(!keys.has(k), 'duplicate normalized name: ' + it.name);
    keys.add(k);
  }
});

test('coverage: all 9 categories (incl. date) present and Jersey City included', () => {
  const { SEED } = loadLogic();
  for (const c of CATS) assert.ok(SEED.some(i => i.categories.includes(c)), 'missing category ' + c);
  assert.ok(SEED.some(i => i.area === 'Jersey City'), 'no Jersey City spot');
});

// Spot ids from the live v1 site; people's saved Visited/Plan marks point at these.
const V1_IDS = ['statue-of-liberty', 'empire-state', 'top-of-the-rock', 'brooklyn-bridge', 'times-square', 'one-world', 'grand-central',
  'rockefeller-center', 'the-met', 'moma', 'amnh', 'guggenheim', 'whitney', 'intrepid', 'tenement-museum', 'brooklyn-museum',
  'central-park', 'prospect-park', 'high-line', 'brooklyn-bridge-park', 'washington-square', 'bryant-park', 'liberty-state-park',
  'joes-pizza', 'katzs', 'chelsea-market', 'levain', 'xian-famous-foods', 'smorgasburg', 'grove-street-dining', 'greenwich-village',
  'soho', 'williamsburg', 'chinatown', 'harlem', 'dumbo', 'little-italy', 'broadway-show', 'blue-note', 'comedy-cellar',
  'lincoln-center', 'apollo-theater', 'beacon-theatre', 'the-cloisters', 'roosevelt-tram', 'green-wood', 'city-island',
  'mana-contemporary', 'little-island', 'elevated-acre', 'staten-island-ferry', 'the-battery', 'exchange-place-walk', 'fort-tryon-park'];

test('every v1 spot id still resolves to a shown spot (directly or via V1_RENAMES)', () => {
  const { SEED, V1_RENAMES } = loadLogic();
  assert.equal(V1_IDS.length, 54);
  const ids = new Set(SEED.map(i => i.id));
  const lost = V1_IDS.filter(id => !ids.has(id) && !ids.has(V1_RENAMES[id]));
  assert.deepEqual(lost, []);
});

test('no two shown spots share a name or alias, and KB_EXTRA never repeats one', () => {
  const { SEED, KB_EXTRA, normalizeKey } = loadLogic();
  const loose = s => normalizeKey(s).replace(/^the /, '');
  const owner = {};
  for (const it of SEED) {
    for (const k of [it.name].concat(it.aliases || []).map(loose)) {
      assert.ok(!owner[k] || owner[k] === it.id, 'shown duplicate "' + k + '": ' + owner[k] + ' vs ' + it.id);
      owner[k] = it.id;
    }
  }
  for (const it of KB_EXTRA) {
    for (const k of [it.name].concat(it.aliases || []).map(loose)) assert.ok(!owner[k], 'KB repeats shown spot: ' + it.name);
  }
});

test('every V1_RENAMES target is a shown spot', () => {
  const { SEED, V1_RENAMES } = loadLogic();
  const ids = new Set(SEED.map(i => i.id));
  assert.deepEqual(Object.keys(V1_RENAMES).filter(k => !ids.has(V1_RENAMES[k])), []);
});

test('common names for well-known spots are recognized, generic phrases are not', () => {
  const { SEED, enrich, addCustomItem } = loadLogic();
  for (const name of ['The Battery', 'The Vessel', 'Vessel', 'The Edge', 'Tramway']) {
    assert.equal(enrich(name).source, 'kb', name + ' should be recognized');
    assert.equal(addCustomItem([], { name, categories: ['iconic'] }, SEED).ok, false, name + ' should be a duplicate');
  }
  for (const name of ['Pottery Class', 'Public Library', 'Botanical Garden', 'The Park', 'The Garden']) {
    assert.equal(addCustomItem([], { name, categories: ['hidden'] }, SEED).ok, true, name + ' should be addable');
  }
});

// Rough lat/lng boxes per borough: they overlap, but catch gross geocoding errors.
const BOXES = {
  'Jersey City': [40.66, 40.77, -74.12, -74.02],
  Manhattan: [40.68, 40.88, -74.03, -73.90],
  Brooklyn: [40.56, 40.74, -74.05, -73.83],
  Queens: [40.54, 40.81, -73.97, -73.70],
  'The Bronx': [40.78, 40.92, -73.94, -73.76],
  'Staten Island': [40.49, 40.65, -74.26, -74.05],
  'Harbor Islands': [40.67, 40.71, -74.05, -74.01],
};
test('every place has coordinates inside its own borough', () => {
  const { SEED, KB_EXTRA, boroughOf } = loadLogic();
  const bad = [];
  for (const it of SEED.concat(KB_EXTRA)) {
    if (typeof it.lat !== 'number' || typeof it.lng !== 'number') { bad.push(it.name + ': no coordinates'); continue; }
    const box = BOXES[boroughOf(it.area)];
    if (!box) continue;
    const [la1, la2, ln1, ln2] = box;
    if (it.lat < la1 || it.lat > la2 || it.lng < ln1 || it.lng > ln2) bad.push(it.name + ' (' + it.area + ') at ' + it.lat + ',' + it.lng);
  }
  assert.deepEqual(bad, []);
});

test('every food place has a cuisine', () => {
  const { SEED, KB_EXTRA } = loadLogic();
  const missing = SEED.concat(KB_EXTRA).filter(i => i.categories.includes('food') && !i.cuisine).map(i => i.name);
  assert.deepEqual(missing, []);
});

test('Eat Nearby finds food for most shown spots, and Chinatown gets Chinatown food', () => {
  const { SEED, KB_EXTRA, nearbyFood } = loadLogic();
  const pool = SEED.concat(KB_EXTRA);
  const withFood = SEED.filter(s => nearbyFood(s, pool).length > 0).length;
  assert.ok(withFood / SEED.length > 0.85, 'only ' + withFood + ' of ' + SEED.length + ' spots have nearby food');
  const ct = SEED.find(s => s.name === 'Chinatown');
  const picks = nearbyFood(ct, pool);
  assert.ok(picks.length >= 3 && picks[0].meters < 600, 'Chinatown should have close food picks');
});

test('stale or unsafe spots are not listed', () => {
  const { SEED, KB_EXTRA } = loadLogic();
  const bad = /breuer|rubin museum|dead horse bay|freedom tunnel|westlight rooftop garden/i;
  assert.deepEqual(SEED.concat(KB_EXTRA).filter(i => bad.test(i.name)).map(i => i.name), []);
});

test('every shown spot lands in a real borough group (none in Elsewhere)', () => {
  const { SEED, boroughOf } = loadLogic();
  const stray = SEED.filter(i => boroughOf(i.area) === 'Elsewhere').map(i => i.name + ' (' + i.area + ')');
  assert.deepEqual(stray, []);
});

test('a curated subset is flagged featured for Browse', () => {
  const { SEED } = loadLogic();
  const featured = SEED.filter(i => i.featured);
  assert.ok(featured.length >= 40 && featured.length <= 100, 'featured count off: ' + featured.length);
});

test('KB_EXTRA adds 250+ recognized places, well-formed and disjoint from SEED', () => {
  const { SEED, KB_EXTRA, normalizeKey } = loadLogic();
  assert.ok(KB_EXTRA.length >= 250, 'KB_EXTRA too small: ' + KB_EXTRA.length);
  const seedNames = new Set(SEED.map(s => normalizeKey(s.name)));
  for (const it of KB_EXTRA) {
    assert.ok(Array.isArray(it.categories) && it.categories.length >= 1, 'categories on ' + it.name);
    for (const c of it.categories) assert.ok(CATS.includes(c), 'bad category ' + c + ' on ' + it.name);
    assert.ok(BUD.includes(it.budget) && TIME.includes(it.time), 'enum on ' + it.name);
    assert.ok(it.name && it.area && it.blurb, 'missing field on ' + it.name);
    assert.ok(!seedNames.has(normalizeKey(it.name)), 'KB_EXTRA overlaps SEED: ' + it.name);
  }
});

test('enrich recognizes a KB_EXTRA-only place and fills a blurb', () => {
  const { enrich, KB_EXTRA } = loadLogic();
  const sample = KB_EXTRA[0];
  const e = enrich(sample.name);
  assert.equal(e.source, 'kb');
  assert.deepEqual(e.categories, sample.categories);
  assert.ok(e.blurb.length > 0);
});

test('the app makes no network requests (plain outbound links are allowed)', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('./extract').HTML_PATH, 'utf8');
  const loads = [/<script[^>]+src=/i, /<link\b/i, /<img\b/i, /<iframe\b/i, /@import/i, /url\(\s*['"]?https?:/i,
    /\bfetch\(/, /XMLHttpRequest/, /new\s+WebSocket/, /navigator\.sendBeacon/, /\.innerHTML\s*=/];
  assert.deepEqual(loads.filter(re => re.test(html)).map(String), []);
});

test('every food place has a reputation and a reservation policy', () => {
  const { SEED, KB_EXTRA } = loadLogic();
  const bad = SEED.concat(KB_EXTRA).filter(i => i.categories.includes('food') &&
    (!['legendary', 'acclaimed', 'local'].includes(i.reputation) || !['required', 'recommended', 'walk-in'].includes(i.reservation))).map(i => i.name);
  assert.deepEqual(bad, []);
});
