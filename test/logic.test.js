'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadLogic } = require('./extract');

test('harness extracts and loads the marked logic block', () => {
  const { ping } = loadLogic();
  assert.equal(ping(), 'pong');
});

// --- Task 2: normalization, custom ids, add-with-dedup ---
test('normalizeKey canonicalizes case, spacing, punctuation', () => {
  const { normalizeKey } = loadLogic();
  assert.equal(normalizeKey('museums', ' The  Met! '), normalizeKey('museums', 'the met'));
});
test('makeCustomId is prefixed and non-name-derived and unique', () => {
  const { makeCustomId } = loadLogic();
  const a = makeCustomId(), b = makeCustomId();
  assert.match(a, /^c_\d+_[a-z0-9]{4,}$/);
  assert.notEqual(a, b);
});
test('adding a name that matches a seed spot is rejected as duplicate', () => {
  const { addCustomItem } = loadLogic();
  const seed = [{ id: 'met-museum', name: 'The Met', category: 'museums', moods: ['artsy'] }];
  const r = addCustomItem([], { name: 'the met', category: 'museums' }, seed);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate');
});
test('adding a genuinely new spot yields a custom id and array moods', () => {
  const { addCustomItem } = loadLogic();
  const r = addCustomItem([], { name: 'Taqueria X', category: 'food', mood: 'foodie' }, []);
  assert.equal(r.ok, true);
  assert.match(r.item.id, /^c_/);
  assert.equal(r.item.custom, true);
  assert.deepEqual(r.item.moods, ['foodie']);
});

// --- Task 3: load-time reconciliation ---
const metSeed = [{ id: 'met-museum', name: 'The Met', category: 'museums', moods: ['artsy'] }];
test('custom item that now matches a seed merges; its visited mark migrates to the seed id', () => {
  const { reconcile } = loadLogic();
  const state = {
    schemaVersion: 1, visited: ['c_1_ab'], plan: ['c_1_ab'],
    customItems: [{ id: 'c_1_ab', name: 'the met', category: 'museums', moods: [], custom: true }],
  };
  const out = reconcile(state, metSeed);
  assert.equal(out.customItems.length, 0);
  assert.deepEqual(out.visited, ['met-museum']);
  assert.deepEqual(out.plan, ['met-museum']);
});
test('orphaned visited/plan ids are dropped', () => {
  const { reconcile } = loadLogic();
  const out = reconcile({ schemaVersion: 1, visited: ['ghost'], plan: ['ghost'], customItems: [] }, metSeed);
  assert.deepEqual(out.visited, []);
  assert.deepEqual(out.plan, []);
});
test('renameMap migrates a mark across a seed id rename', () => {
  const { reconcile } = loadLogic();
  const out = reconcile({ schemaVersion: 1, visited: ['met-old'], plan: [], customItems: [] }, metSeed, { 'met-old': 'met-museum' });
  assert.deepEqual(out.visited, ['met-museum']);
});
test('plan de-dups to first position after a merge', () => {
  const { reconcile } = loadLogic();
  const state = {
    schemaVersion: 1, visited: [], plan: ['met-museum', 'c_1_ab'],
    customItems: [{ id: 'c_1_ab', name: 'the met', category: 'museums', moods: [], custom: true }],
  };
  assert.deepEqual(reconcile(state, metSeed).plan, ['met-museum']);
});

// --- Task 4: offline enricher ---
const enrichKb = {
  'statue of liberty': { category: 'iconic', area: 'Liberty Island', budget: '$$', moods: ['touristy'], time: 'half', aliases: ['lady liberty'] },
};
test('KB hit returns curated attributes', () => {
  const { enrich } = loadLogic();
  const e = enrich('Statue of Liberty', enrichKb);
  assert.equal(e.source, 'kb');
  assert.equal(e.category, 'iconic');
  assert.ok(Array.isArray(e.moods));
});
test('KB alias also resolves', () => {
  const { enrich } = loadLogic();
  assert.equal(enrich('Lady Liberty', enrichKb).category, 'iconic');
});
test('unknown "…Park" uses the parks heuristic', () => {
  const { enrich } = loadLogic();
  const e = enrich('Some Random Park', enrichKb);
  assert.equal(e.category, 'parks');
  assert.equal(e.budget, 'free');
  assert.equal(e.source, 'heuristic');
});
test('unrecognized input falls back to safe defaults without throwing', () => {
  const { enrich } = loadLogic();
  const e = enrich('zzqqxx', enrichKb);
  assert.equal(e.source, 'default');
  assert.ok(Array.isArray(e.moods));
});

// --- Task 5: filtering, surprise, progress, areas ---
const filterItems = [
  { id: 'a', moods: ['chill'], budget: 'free', area: 'Central Park', time: 'half' },
  { id: 'b', moods: ['foodie'], budget: '$$', area: 'West Village', time: 'quick' },
  { id: 'c', moods: ['touristy'], budget: '$$', area: 'Jersey City', time: 'half' },
];
test('applyFilters ANDs fields and matches a mood inside the array', () => {
  const { applyFilters } = loadLogic();
  assert.deepEqual(applyFilters(filterItems, { mood: 'foodie' }).map(i => i.id), ['b']);
  assert.deepEqual(applyFilters(filterItems, { budget: '$$', time: 'half' }).map(i => i.id), ['c']);
});
test('applyFilters with no constraints returns everything', () => {
  const { applyFilters } = loadLogic();
  assert.equal(applyFilters(filterItems, {}).length, 3);
});
test('pickSurprise returns null on an empty filtered set, else a match', () => {
  const { pickSurprise } = loadLogic();
  assert.equal(pickSurprise(filterItems, { mood: 'nope' }), null);
  assert.equal(pickSurprise(filterItems, { area: 'Jersey City' }, () => 0).id, 'c');
});
test('progress counts only visited ids present in the catalog', () => {
  const { progress } = loadLogic();
  assert.deepEqual(progress(['a', 'ghost'], filterItems), { count: 1, total: 3 });
});
test('deriveAreas returns sorted unique areas incl. Jersey City', () => {
  const { deriveAreas } = loadLogic();
  const areas = deriveAreas(filterItems);
  assert.ok(areas.includes('Jersey City'));
  assert.deepEqual(areas, [...areas].sort());
});

// --- Task 6: storage wrapper with failure fallback ---
function memStore() {
  let m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
}
function throwingStore() {
  return { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
}
test('store round-trips and reconciles on load', () => {
  const { makeStore } = loadLogic();
  const s = makeStore(memStore());
  const st = s.load(metSeed);
  st.visited.push('met-museum');
  s.save(st);
  assert.equal(makeStore(memStore()).available, true);
  assert.deepEqual(s.load(metSeed).visited, ['met-museum']);
});
test('a throwing storage degrades to in-memory and sets available=false, no throw', () => {
  const { makeStore } = loadLogic();
  const s = makeStore(throwingStore());
  assert.doesNotThrow(() => {
    const st = s.load(metSeed);
    st.visited.push('met-museum');
    s.save(st);
  });
  assert.equal(s.available, false);
});

// --- Final review fixes ---
test('safeStorage returns null when localStorage access throws, without crashing', () => {
  const { safeStorage } = loadLogic();
  const blocked = {};
  Object.defineProperty(blocked, 'localStorage', { get() { throw new Error('SecurityError'); } });
  assert.doesNotThrow(function () { safeStorage(blocked); });
  assert.equal(safeStorage(blocked), null);
  var ok = { localStorage: { getItem: function () { return null; }, setItem: function () {} } };
  assert.equal(safeStorage(ok), ok.localStorage);
  assert.equal(safeStorage(null), null);
});
test('reconcile tolerates a malformed stored shape without throwing', () => {
  const { reconcile } = loadLogic();
  var out;
  assert.doesNotThrow(function () { out = reconcile({ visited: {}, plan: 'x', customItems: null }, metSeed); });
  assert.deepEqual(out.visited, []);
  assert.deepEqual(out.plan, []);
  assert.deepEqual(out.customItems, []);
});
