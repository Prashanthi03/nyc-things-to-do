'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadLogic } = require('./extract');

test('harness extracts and loads the marked logic block', () => {
  const { normalizeKey } = loadLogic();
  assert.equal(normalizeKey(' The  Met! '), 'the met');
});

// --- borough grouping for the explorer index ---
test('boroughOf maps neighborhoods, suffixed areas, islands, and unknowns', () => {
  const { boroughOf } = loadLogic();
  assert.equal(boroughOf('Jersey City'), 'Jersey City');
  assert.equal(boroughOf('Williamsburg'), 'Brooklyn');
  assert.equal(boroughOf('Red Hook, Brooklyn'), 'Brooklyn');
  assert.equal(boroughOf('Upper East Side'), 'Manhattan');
  assert.equal(boroughOf('Astoria'), 'Queens');
  assert.equal(boroughOf('Pelham Bay, Bronx'), 'The Bronx');
  assert.equal(boroughOf('St. George'), 'Staten Island');
  assert.equal(boroughOf('Liberty Island'), 'Harbor Islands');
  assert.equal(boroughOf('Narnia'), 'Elsewhere');
  assert.equal(boroughOf(undefined), 'Elsewhere');
});

// --- themes stay readable ---
test('contrastRatio matches the WCAG formula at the extremes', () => {
  const { contrastRatio } = loadLogic();
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio('#777777', '#777777') - 1) < 0.01);
});
test('the single blended theme keeps text pairs at WCAG AA (>= 4.5:1)', () => {
  const { THEMES, contrastRatio } = loadLogic();
  const keys = Object.keys(THEMES);
  assert.deepEqual(keys, ['nyc'], 'expected one default theme');
  for (const k of keys) {
    const t = THEMES[k];
    for (const [fg, bg] of [['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface2'], ['muted', 'surface'], ['onPrimary', 'primary'],
      ['headerInk', 'headerBase'], ['headerInk', 'headerEnd'], ['headerInk', 'tabsBg']]) {
      const r = contrastRatio(t[fg], t[bg]);
      assert.ok(r >= 4.5, k + ': ' + fg + ' on ' + bg + ' is ' + r.toFixed(2));
    }
  }
});

// --- travel time (public transit estimate from Van Vorst St, Jersey City) ---
test('travelTime estimates transit minutes by area, with a numeric fallback', () => {
  const { travelTime } = loadLogic();
  assert.ok(travelTime('Jersey City') <= 20, 'JC should be close');
  assert.ok(travelTime('Midtown') >= 25);
  assert.ok(travelTime('Upper East Side') > travelTime('Financial District'));
  assert.equal(typeof travelTime('Totally Unknown Place'), 'number');
  assert.ok(travelTime('Williamsburg, Brooklyn') >= 35, 'borough keyword fallback');
});
test('travelTime handles suffixes, case variants, and far-flung neighborhoods', () => {
  const { travelTime } = loadLogic();
  assert.equal(travelTime('Red Hook, Brooklyn'), travelTime('Red Hook'));
  assert.equal(travelTime('Dumbo'), travelTime('DUMBO'));
  assert.ok(travelTime('Inwood') >= 55, 'Inwood is far uptown');
  assert.ok(travelTime('Midwood') >= 55, 'Midwood is deep Brooklyn');
  assert.ok(travelTime('Bayside, Queens') >= 50, 'unknown Queens area uses the borough default');
});
test('hopKind only calls a hop walkable within a real neighborhood, not a whole borough', () => {
  const { hopKind } = loadLogic();
  assert.equal(hopKind({ area: 'Chelsea' }, { area: 'Chelsea' }), 'walk');
  assert.equal(hopKind({ area: 'Brooklyn' }, { area: 'Brooklyn' }), 'hop', 'two spots tagged just "Brooklyn" are not walkable');
  assert.equal(hopKind({ area: 'Williamsburg' }, { area: 'Bushwick' }), 'hop');
  assert.equal(hopKind({ area: 'Midtown' }, { area: 'Williamsburg' }), 'cross');
  assert.equal(hopKind({ area: 'Narnia' }, { area: 'Atlantis' }), 'cross');
  assert.notEqual(hopKind({ area: 'New York Harbor' }, { area: 'New York Harbor' }), 'walk', 'a harbor is not a neighborhood');
  assert.notEqual(hopKind({ area: 'NYC' }, { area: 'NYC' }), 'walk');
  assert.equal(hopKind({}, { area: 'Chelsea' }), 'cross', 'missing area never throws');
});
test('generatePlan keeps a multi-stop plan in one borough before crossing the river', () => {
  const { generatePlan } = loadLogic();
  const items = [
    { id: 'a', name: 'a', area: 'Williamsburg', moods: ['chill'], budget: '$', time: 'half', categories: ['food'] },
    { id: 'd', name: 'd', area: 'Midtown', moods: ['chill'], budget: '$', time: 'half', categories: ['food'] },
    { id: 'e', name: 'e', area: 'Harlem', moods: ['chill'], budget: '$', time: 'half', categories: ['food'] },
    { id: 'b', name: 'b', area: 'Bushwick', moods: ['chill'], budget: '$', time: 'half', categories: ['food'] },
    { id: 'c', name: 'c', area: 'Greenpoint', moods: ['chill'], budget: '$', time: 'half', categories: ['food'] },
  ];
  // rng 0.999 leaves this order unshuffled, so Manhattan spots come right after the
  // Williamsburg anchor; the plan must still pull the anchor's Brooklyn mates first.
  const plan = generatePlan(items, { scope: 'half' }, () => 0.999);
  const { boroughOf } = loadLogic();
  const b0 = boroughOf(plan[0].area);
  assert.ok(plan.every(p => boroughOf(p.area) === b0), 'plan crossed boroughs: ' + plan.map(p => p.area).join(', '));
});

// --- normalization, custom ids, add-with-dedup (v2: name-only key, categories[]) ---
test('normalizeKey canonicalizes case, spacing, punctuation (name only)', () => {
  const { normalizeKey } = loadLogic();
  assert.equal(normalizeKey(' The  Met! '), normalizeKey('the met'));
});
test('makeCustomId is prefixed and non-name-derived and unique', () => {
  const { makeCustomId } = loadLogic();
  const a = makeCustomId(), b = makeCustomId();
  assert.match(a, /^c_\d+_[a-z0-9]{4,}$/);
  assert.notEqual(a, b);
});
test('adding a name that matches a seed spot is rejected as duplicate', () => {
  const { addCustomItem } = loadLogic();
  const seed = [{ id: 'met-museum', name: 'The Met', categories: ['museums'], moods: ['artsy'] }];
  const r = addCustomItem([], { name: 'the met', categories: ['museums'] }, seed);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate');
});
test('adding a known alias or a "The ..." variant of a shown spot is a duplicate', () => {
  const { addCustomItem } = loadLogic();
  const seed = [{ id: 'sol', name: 'Statue of Liberty', categories: ['iconic'], aliases: ['lady liberty'] }, { id: 'apollo', name: 'Apollo Theater', categories: ['shows'] }];
  assert.equal(addCustomItem([], { name: 'Lady Liberty', categories: ['iconic'] }, seed).ok, false);
  assert.equal(addCustomItem([], { name: 'The Apollo Theater', categories: ['shows'] }, seed).ok, false);
  assert.equal(addCustomItem([], { name: 'Apollo Bagels', categories: ['food'] }, seed).ok, true);
});
test('dedup is by name across categories (v2)', () => {
  const { addCustomItem } = loadLogic();
  const seed = [{ id: 'rb', name: 'Roof Bar', categories: ['shows'] }];
  const r = addCustomItem([], { name: 'roof bar', categories: ['date'] }, seed);
  assert.equal(r.ok, false);
});
test('adding a genuinely new spot yields a custom id, categories array, moods array, blurb', () => {
  const { addCustomItem } = loadLogic();
  const r = addCustomItem([], { name: 'Taqueria X', categories: ['food', 'date'], mood: 'foodie', blurb: 'Tiny taco gem.' }, []);
  assert.equal(r.ok, true);
  assert.match(r.item.id, /^c_/);
  assert.equal(r.item.custom, true);
  assert.deepEqual(r.item.moods, ['foodie']);
  assert.deepEqual(r.item.categories, ['food', 'date']);
  assert.equal(r.item.blurb, 'Tiny taco gem.');
});
test('addCustomItem defaults categories to hidden when none given', () => {
  const { addCustomItem } = loadLogic();
  const r = addCustomItem([], { name: 'Mystery Spot' }, []);
  assert.ok(r.ok);
  assert.deepEqual(r.item.categories, ['hidden']);
});

// --- Task 3: load-time reconciliation ---
const metSeed = [{ id: 'met-museum', name: 'The Met', categories: ['museums'], moods: ['artsy'] }];
test('custom item that now matches a seed merges; its visited mark migrates to the seed id', () => {
  const { reconcile } = loadLogic();
  const state = {
    schemaVersion: 1, visited: ['c_1_ab'], plan: ['c_1_ab'],
    customItems: [{ id: 'c_1_ab', name: 'the met', categories: ['museums'], moods: [], custom: true }],
  };
  const out = reconcile(state, metSeed);
  assert.equal(out.customItems.length, 0);
  assert.deepEqual(out.visited, ['met-museum']);
  assert.deepEqual(out.plan, ['met-museum']);
});
test('reconcile upgrades v1 custom items (single category) and drops nameless junk', () => {
  const { reconcile } = loadLogic();
  const state = {
    schemaVersion: 1, visited: ['c_9_zz'], plan: [],
    customItems: [
      { id: 'c_9_zz', name: 'Tiny Taco Spot', category: 'food', moods: 'foodie', custom: true },
      { id: 'c_8_yy' },
    ],
  };
  const out = reconcile(state, metSeed);
  assert.equal(out.customItems.length, 1);
  assert.deepEqual(out.customItems[0].categories, ['food']);
  assert.deepEqual(out.customItems[0].moods, ['foodie']);
  assert.deepEqual(out.visited, ['c_9_zz']);
  assert.equal(out.schemaVersion, 2);
});
test('reconcile with V1_RENAMES keeps v1 Visited/Plan marks on renamed spots', () => {
  const { reconcile, SEED, V1_RENAMES } = loadLogic();
  const out = reconcile({ schemaVersion: 1, visited: ['the-met', 'joes-pizza', 'statue-of-liberty'], plan: ['katzs'], customItems: [] }, SEED, V1_RENAMES);
  assert.deepEqual(out.visited.slice().sort(), [V1_RENAMES['joes-pizza'], 'statue-of-liberty', V1_RENAMES['the-met']].sort());
  assert.deepEqual(out.plan, [V1_RENAMES.katzs]);
});
test('a custom spot whose name is only a seed alias is NOT merged away on reload', () => {
  const { reconcile } = loadLogic();
  const seed = [{ id: 'cp', name: 'Central Park', categories: ['parks'], aliases: ['the park'] }];
  const out = reconcile({ visited: ['c_5_p'], plan: [], customItems: [{ id: 'c_5_p', name: 'The Park', categories: ['food'], moods: [], blurb: 'My corner cafe' }] }, seed);
  assert.equal(out.customItems.length, 1);
  assert.equal(out.customItems[0].blurb, 'My corner cafe');
  assert.deepEqual(out.visited, ['c_5_p']);
});
test('a custom spot named like an Object.prototype key survives reload', () => {
  const { reconcile } = loadLogic();
  const out = reconcile({ visited: ['c_1_aa'], plan: [], customItems: [{ id: 'c_1_aa', name: 'Constructor', categories: ['food'], moods: [] }] }, metSeed);
  assert.equal(out.customItems.length, 1);
  assert.deepEqual(out.visited, ['c_1_aa']);
});
test('upgraded custom items have a string name and only known categories', () => {
  const { reconcile } = loadLogic();
  const out = reconcile({ visited: [], plan: [], customItems: [{ id: 'c_2_bb', name: 42, categories: ['constructor', 'toString'], moods: ['chill', 7] }] }, metSeed);
  assert.equal(out.customItems[0].name, '42');
  assert.deepEqual(out.customItems[0].categories, ['hidden']);
  assert.deepEqual(out.customItems[0].moods, ['chill']);
});
test('reconcile merges v1 custom items that share a name, keeping both sets of marks', () => {
  const { reconcile } = loadLogic();
  const state = {
    visited: ['c_3_b'], plan: ['c_3_a', 'c_3_b'],
    customItems: [
      { id: 'c_3_a', name: 'Tiny Taco', category: 'food', moods: [] },
      { id: 'c_3_b', name: 'tiny taco!', category: 'date', moods: [] },
    ],
  };
  const out = reconcile(state, metSeed);
  assert.equal(out.customItems.length, 1);
  assert.deepEqual(out.customItems[0].categories, ['food', 'date']);
  assert.deepEqual(out.visited, ['c_3_a']);
  assert.deepEqual(out.plan, ['c_3_a']);
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
    customItems: [{ id: 'c_1_ab', name: 'the met', categories: ['museums'], moods: [], custom: true }],
  };
  assert.deepEqual(reconcile(state, metSeed).plan, ['met-museum']);
});

// --- offline enricher (v2: library array, categories[], blurb) ---
const enrichLib = [
  { id: 'sol', name: 'Statue of Liberty', categories: ['iconic', 'date'], area: 'Liberty Island', budget: '$$', moods: ['touristy'], time: 'half', blurb: 'Lady Liberty herself.', aliases: ['lady liberty'] },
];
test('library hit returns curated attributes incl categories and blurb', () => {
  const { enrich } = loadLogic();
  const e = enrich('Statue of Liberty', enrichLib);
  assert.equal(e.source, 'kb');
  assert.deepEqual(e.categories, ['iconic', 'date']);
  assert.equal(e.blurb, 'Lady Liberty herself.');
  assert.equal(e.area, 'Liberty Island');
  assert.ok(Array.isArray(e.moods));
});
test('library alias resolves', () => {
  const { enrich } = loadLogic();
  assert.deepEqual(enrich('Lady Liberty', enrichLib).categories, ['iconic', 'date']);
});
test('unknown "…Park" heuristic returns a categories array', () => {
  const { enrich } = loadLogic();
  const e = enrich('Some Random Park', enrichLib);
  assert.deepEqual(e.categories, ['parks']);
  assert.equal(e.budget, 'free');
  assert.equal(e.source, 'heuristic');
});
test('unrecognized input falls back to safe defaults without throwing', () => {
  const { enrich } = loadLogic();
  const e = enrich('zzqqxx', enrichLib);
  assert.equal(e.source, 'default');
  assert.deepEqual(e.categories, ['hidden']);
  assert.ok(Array.isArray(e.moods));
});
test('suggestNames matches by name/alias substring, limited', () => {
  const { suggestNames } = loadLogic();
  const lib = [{ name: 'The Met' }, { name: 'Met Cloisters' }, { name: 'MoMA' }, { name: 'Brooklyn Bridge', aliases: ['the met bridge joke'] }];
  const r = suggestNames(lib, 'met', 10);
  const names = r.map(i => i.name);
  assert.ok(names.indexOf('The Met') !== -1);
  assert.ok(names.indexOf('Met Cloisters') !== -1);
  assert.ok(names.indexOf('MoMA') === -1);
  assert.ok(suggestNames(lib, 'xyz', 10).length === 0);
  assert.ok(suggestNames(lib, 'e', 2).length <= 2);
});
test('searchItems matches name, area, or category', () => {
  const { searchItems } = loadLogic();
  const items = [
    { name: 'The Met', area: 'Upper East Side', categories: ['museums', 'date'] },
    { name: 'Joe Pizza', area: 'West Village', categories: ['food'] },
  ];
  assert.equal(searchItems(items, 'met').length, 1);
  assert.equal(searchItems(items, 'village').length, 1);
  assert.equal(searchItems(items, 'food').length, 1);
  assert.equal(searchItems(items, 'date').length, 1);
  assert.equal(searchItems(items, '').length, 2);
});
test('generatePlan sizes by scope, applies filters, clusters, handles empty', () => {
  const { generatePlan } = loadLogic();
  const items = Array.from({ length: 8 }, (_, i) => ({ id: 'i' + i, name: 'n' + i, area: i < 4 ? 'A' : 'B', budget: '$$', moods: ['chill'], time: 'half', categories: ['food'] }));
  assert.equal(generatePlan(items, { scope: 'one' }, () => 0).length, 1);
  assert.equal(generatePlan(items, { scope: 'half' }, () => 0).length, 3);
  assert.equal(generatePlan(items, { scope: 'full' }, () => 0).length, 5);
  assert.equal(generatePlan([], { scope: 'full' }, () => 0).length, 0);
  const mixed = [
    { id: 'a', name: 'a', area: 'A', budget: 'free', moods: ['chill'], time: 'half', categories: ['x'] },
    { id: 'b', name: 'b', area: 'B', budget: '$$', moods: ['foodie'], time: 'quick', categories: ['y'] },
  ];
  const r = generatePlan(mixed, { scope: 'full', budget: 'free' }, () => 0);
  assert.ok(r.every(x => x.budget === 'free'));
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
