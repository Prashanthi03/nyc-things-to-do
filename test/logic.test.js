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
// --- real distances (coordinates) ---
const TSQ = { id: 'tsq', name: 'Times Square', area: 'Midtown', lat: 40.7580, lng: -73.9855, categories: ['iconic'] };
const ESB = { id: 'esb', name: 'Empire State Building', area: 'Midtown', lat: 40.7484, lng: -73.9857, categories: ['iconic'] };
test('distanceMeters uses great-circle distance and tolerates missing coordinates', () => {
  const { distanceMeters } = loadLogic();
  const d = distanceMeters(TSQ, ESB);
  assert.ok(d > 1000 && d < 1130, 'Times Square to ESB is about 1.07 km, got ' + d);
  assert.equal(distanceMeters(TSQ, { name: 'nowhere' }), null);
});
test('hopInfo says walk for short hops and transit for longer ones, in miles', () => {
  const { hopInfo } = loadLogic();
  const near = hopInfo(TSQ, { area: 'Midtown', lat: 40.7587, lng: -73.9787 });
  assert.equal(near.mode, 'walk');
  assert.match(near.label, /mi · ~\d+ min walk$/);
  const far = hopInfo(TSQ, { area: 'Financial District', lat: 40.7033, lng: -73.9881 });
  assert.equal(far.mode, 'transit');
  assert.match(far.label, /mi · ~\d+ min by transit$/);
  assert.ok(far.minutes > near.minutes);
  assert.equal(hopInfo(TSQ, { name: 'no coords' }), null);
});
test('locate falls back to the center of known spots in the same area', () => {
  const { locate } = loadLogic();
  const p = locate({ name: 'My Spot', area: 'Midtown', custom: true }, [TSQ, ESB]);
  assert.ok(Math.abs(p.lat - 40.7532) < 0.001 && Math.abs(p.lng - -73.9856) < 0.001);
  assert.equal(locate({ name: 'x', area: 'Narnia' }, [TSQ, ESB]), null);
});
test('nearbyFood lists close food spots with walk time, nearest first, excluding the spot itself', () => {
  const { nearbyFood } = loadLogic();
  const food = (id, lat, lng) => ({ id, name: id, area: 'Midtown', lat, lng, categories: ['food'], cuisine: 'Pizza', budget: '$', moods: ['foodie'] });
  const pool = [food('f-far', 40.70, -74.00), food('f-mid', 40.7550, -73.9855), food('f-close', 40.7575, -73.9855), TSQ, ESB];
  const r = nearbyFood(TSQ, pool, { limit: 5 });
  assert.deepEqual(r.map(x => x.item.id), ['f-close', 'f-mid']);
  assert.ok(r[0].walkMin <= r[1].walkMin);
  assert.ok(nearbyFood(r[0].item, pool).every(x => x.item.id !== 'f-close'), 'never recommends itself');
});
test('nearbyFood recommends places to eat, not whole neighborhoods tagged food', () => {
  const { nearbyFood } = loadLogic();
  const pool = [
    { id: 'hood', name: 'Chinatown', area: 'Midtown', lat: 40.7576, lng: -73.9855, categories: ['neighborhoods', 'food'], cuisine: 'Eclectic', budget: '$', moods: [] },
    { id: 'eat', name: 'Dumpling Spot', area: 'Midtown', lat: 40.7578, lng: -73.9855, categories: ['food'], cuisine: 'Dumplings', budget: '$', moods: [] },
  ];
  assert.deepEqual(nearbyFood(TSQ, pool).map(r => r.item.id), ['eat']);
});
test('nearbyFood widens the radius when the close circle is nearly empty', () => {
  const { nearbyFood } = loadLogic();
  const pool = [{ id: 'f1', name: 'f1', area: 'Upper West Side', lat: 40.7740, lng: -73.9855, categories: ['food'], cuisine: 'Bagels', budget: '$', moods: [] }];
  assert.equal(nearbyFood(TSQ, pool).length, 1, 'a ~1.8 km spot appears once the radius widens');
});
test('generatePlan orders stops so each next stop is the nearest remaining one', () => {
  const { generatePlan } = loadLogic();
  const s = (id, lat) => ({ id, name: id, area: 'Midtown', lat, lng: -73.9855, moods: ['chill'], budget: '$', time: 'half', categories: ['iconic'] });
  const items = [s('a', 40.7500), s('far', 40.7900), s('b', 40.7520), s('c', 40.7545)];
  const plan = generatePlan(items, { scope: 'half' }, () => 0.999);
  assert.deepEqual(plan.map(p => p.id), ['a', 'b', 'c']);
});
test('generatePlan can include a custom spot (no coordinates) via its neighborhood center', () => {
  const { generatePlan } = loadLogic();
  const s = (id, lat) => ({ id, name: id, area: 'Midtown', lat, lng: -73.9855, moods: ['chill'], budget: '$', time: 'half', categories: ['iconic'] });
  const mine = { id: 'c_1_me', name: 'My Midtown Spot', area: 'Midtown', moods: ['chill'], budget: '$', time: 'half', categories: ['hidden'], custom: true };
  const plan = generatePlan([s('a', 40.7500), s('b', 40.7600), mine], { scope: 'half' }, () => 0.999);
  assert.ok(plan.some(p => p.id === 'c_1_me'), 'custom spot was dropped from the plan');
});
// --- water, coarse areas, and recognized places ---
const FIDI = { id: 'fidi', name: 'Stone Street', area: 'Financial District', lat: 40.7041, lng: -74.0105, categories: ['food'], cuisine: 'Pub', budget: '$$', moods: [] };
const RIVERCAFE = { id: 'rc', name: 'The River Cafe', area: 'DUMBO', lat: 40.7037, lng: -73.9947, categories: ['food'], cuisine: 'American', budget: '$$$', moods: [] };
test('hopInfo never suggests walking across water', () => {
  const { hopInfo } = loadLogic();
  const h = hopInfo(FIDI, RIVERCAFE);
  assert.notEqual(h.mode, 'walk', 'Financial District to DUMBO crosses the East River');
  const gov = { id: 'gov', name: 'Governors Island', area: 'Governors Island', lat: 40.6895, lng: -74.0168 };
  const red = { id: 'red', name: 'Red Hook Spot', area: 'Red Hook', lat: 40.6780, lng: -74.0100 };
  assert.match(hopInfo(gov, red).label, /ferry/i, 'island hops say ferry');
});
test('nearbyFood only suggests places you can walk to (same landmass)', () => {
  const { nearbyFood } = loadLogic();
  const gov = { id: 'gov', name: 'Governors Island', area: 'Governors Island', lat: 40.6895, lng: -74.0168, categories: ['parks'] };
  const brooklynEat = { id: 'b', name: 'Brooklyn Eats', area: 'Red Hook', lat: 40.6800, lng: -74.0110, categories: ['food'], cuisine: 'Pizza', budget: '$', moods: [] };
  assert.deepEqual(nearbyFood(gov, [brooklynEat]), []);
  assert.deepEqual(nearbyFood(FIDI, [RIVERCAFE]), [], 'no River Cafe "walk" from the Financial District');
});
test('a custom spot whose area is a whole borough gets no fake coordinates', () => {
  const { locate } = loadLogic();
  assert.equal(locate({ name: 'Mine', area: 'Brooklyn', custom: true }, [RIVERCAFE, { area: 'Brooklyn', lat: 40.68, lng: -73.95 }]), null);
});
test('generatePlan fills the plan even when some picks have no location', () => {
  const { generatePlan } = loadLogic();
  const seedOne = { id: 's', name: 's', area: 'Midtown', lat: 40.75, lng: -73.98, moods: ['chill'], budget: '$', time: 'half', categories: ['iconic'] };
  const c1 = { id: 'c_1', name: 'Hoboken Spot', area: 'Hoboken', moods: ['chill'], budget: '$', time: 'half', categories: ['hidden'], custom: true };
  const c2 = { id: 'c_2', name: 'Montclair Spot', area: 'Montclair', moods: ['chill'], budget: '$', time: 'half', categories: ['hidden'], custom: true };
  for (const r of [0, 0.4, 0.999]) assert.equal(generatePlan([seedOne, c1, c2], { scope: 'half' }, () => r).length, 3);
});
test('enrich returns location and food details for a recognized place, and Add keeps them', () => {
  const { enrich, addCustomItem } = loadLogic();
  const lib = [{ id: 'kb-x', name: 'Test Dumplings', categories: ['food'], area: 'Chinatown', budget: '$', moods: ['foodie'], time: 'quick',
    blurb: 'b', lat: 40.715, lng: -73.998, cuisine: 'Dumplings', reputation: 'local', reservation: 'walk-in' }];
  const e = enrich('Test Dumplings', lib);
  assert.equal(e.lat, 40.715); assert.equal(e.cuisine, 'Dumplings'); assert.equal(e.reservation, 'walk-in');
  const r = addCustomItem([], { name: 'Test Dumplings', categories: ['food'], lat: e.lat, lng: e.lng, cuisine: e.cuisine, reputation: e.reputation, reservation: e.reservation }, []);
  assert.equal(r.item.lat, 40.715); assert.equal(r.item.cuisine, 'Dumplings'); assert.equal(r.item.reputation, 'local');
  const bad = addCustomItem([], { name: 'Odd', lat: 'x', reputation: 'amazing', reservation: 'maybe' }, []);
  assert.equal(bad.item.lat, undefined); assert.equal(bad.item.reputation, undefined); assert.equal(bad.item.reservation, undefined);
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

// Date plans: fixtures around the West Village (lat/lng in degrees; ~0.01° lat ≈ 1.1 km).
function datePlaces() {
  const at = (id, cats, lat, lng, extra) => Object.assign({ id, name: id, categories: cats, area: 'West Village', budget: '$$', moods: ['romantic'], time: 'half', lat, lng }, extra);
  return [
    at('dinner', ['food', 'date'], 40.733, -74.004, { dateWhen: ['evening', 'night'], budget: '$$$' }),
    at('lunchspot', ['food', 'date'], 40.735, -74.003, { dateWhen: ['day', 'evening', 'night'] }),
    at('steakhouse', ['food'], 40.7331, -74.0041),
    at('pier', ['parks', 'date'], 40.734, -74.010, { dateWhen: ['day', 'evening', 'night'], outdoor: true }),
    at('garden', ['parks', 'date'], 40.736, -74.006, { dateWhen: ['day'], outdoor: true }),
    at('jazz', ['shows', 'date'], 40.7335, -74.0045, { dateWhen: ['night'], outdoor: false }),
    at('rink', ['parks', 'date'], 40.7332, -74.0042, { dateWhen: ['night'], outdoor: true, seasonal: true }),
    at('promenade', ['parks', 'date'], 40.740, -74.009, { dateWhen: ['evening', 'night'], outdoor: true }),
    at('faraway', ['parks', 'date'], 40.850, -73.900, { dateWhen: ['day', 'evening', 'night'], outdoor: true, area: 'The Bronx' }),
  ];
}
const ids = (plan) => plan.map((x) => x.id);

test('date night: dinner first, then the closest outdoor after-dark spots, never seasonal or far away', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  const plan = generatePlan(places, { scope: 'date-night', budget: '$$$' }, () => 0, places);
  assert.deepEqual(ids(plan), ['dinner', 'pier', 'promenade']);
  assert.equal(plan.roles.dinner, '🍽️ Dinner');
  assert.equal(plan.roles.pier, '🌃 After Dark');
});

test('date evening: outdoor golden-hour spot, dinner, then an after-dark stop (indoor allowed)', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  const plan = generatePlan(places, { scope: 'date-evening', budget: '$$$' }, () => 0, places);
  assert.deepEqual(ids(plan), ['pier', 'dinner', 'jazz']);
  assert.equal(plan.roles.pier, '🌇 Golden Hour');
});

test('half-day date: lunch only at places that serve it, with daytime spots around it', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  for (let r = 0; r < 1; r += 0.1) {
    const plan = generatePlan(places, { scope: 'date-day' }, () => r, places);
    assert.equal(plan[1].id, 'lunchspot');
    assert.deepEqual(ids(plan).sort(), ['garden', 'lunchspot', 'pier']);
  }
});

test('date plans: budget and area narrow the restaurant only; no restaurant means no plan', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  assert.equal(generatePlan(places, { scope: 'date-night', budget: '$$' }, () => 0, places)[0].id, 'lunchspot');
  assert.deepEqual(generatePlan(places, { scope: 'date-night', budget: '$' }, () => 0, places), []);
  assert.deepEqual(generatePlan(places, { scope: 'date-night', area: 'The Bronx' }, () => 0, places), []);
});

test('date plans: a custom date restaurant without timing details can anchor a plan', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces().filter((p) => !p.categories.includes('food'));
  places.push({ id: 'c_1', name: 'My Spot', categories: ['food', 'date'], area: 'West Village', budget: '$$', moods: [], time: 'half', custom: true });
  const plan = generatePlan(places, { scope: 'date-night' }, () => 0, places.concat(datePlaces()));
  assert.equal(plan[0].id, 'c_1');
  assert.ok(plan.length > 1, 'located via its neighborhood, so nearby stops are added');
});

test('adding a recognized date restaurant keeps its dress code, vibe and timing', () => {
  const { addCustomItem } = loadLogic();
  const r = addCustomItem([], { name: 'Somewhere', categories: ['food', 'date'], dress: 'dressy', vibe: 'Candlelit', dateWhen: ['night', 'bogus'], outdoor: false }, []);
  assert.equal(r.item.dress, 'dressy');
  assert.equal(r.item.vibe, 'Candlelit');
  assert.deepEqual(r.item.dateWhen, ['night']);
  assert.equal(r.item.outdoor, false);
  assert.equal(addCustomItem([], { name: 'X', dress: 'tuxedo' }, []).item.dress, undefined);
});

test('date plans favour a different kind of stop over a second one of the same kind', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  places.push({ id: 'deck', name: 'deck', categories: ['iconic', 'date'], area: 'West Village', budget: '$$$', moods: [], time: 'quick', lat: 40.7415, lng: -74.0095, dateWhen: ['night'], outdoor: true });
  const plan = generatePlan(places, { scope: 'date-night', budget: '$$$' }, () => 0, places);
  assert.deepEqual(ids(plan), ['dinner', 'pier', 'deck'], 'deck beats the slightly closer second park');
});

test('suggestNearPlan: closest spots to any stop, same landmass, not already planned, with the nearest stop', () => {
  const { suggestNearPlan } = loadLogic();
  const P = (id, cats, lat, lng, area) => ({ id, name: id, categories: cats, area: area || 'West Village', budget: 'free', moods: [], time: 'quick', lat, lng });
  const a = P('a', ['parks'], 40.733, -74.004), b = P('b', ['parks'], 40.760, -73.980, 'Midtown');
  const near = P('near', ['hidden'], 40.734, -74.004), nearB = P('nearB', ['iconic'], 40.761, -73.980, 'Midtown');
  const far = P('far', ['hidden'], 40.780, -73.960, 'Upper East Side');
  const water = P('water', ['parks'], 40.733, -74.0, 'Brooklyn');
  const pool = [a, b, near, nearB, far, water, P('A Copy', ['parks'], 40.7331, -74.004)];
  pool[6].name = 'a';
  const out = suggestNearPlan([a, b], pool, pool);
  assert.deepEqual(out.map((r) => r.item.id), ['near', 'nearB']);
  assert.equal(out[0].near.id, 'a');
  assert.ok(out[0].walkMin >= 1, 'walk minutes for the label');
  assert.equal(out[1].near.id, 'b');
});

test('suggestNearPlan: a plan with no food stop always gets a food idea, and keep() narrows (e.g. dates only)', () => {
  const { suggestNearPlan } = loadLogic();
  const P = (id, cats, lat, extra) => Object.assign({ id, name: id, categories: cats, area: 'West Village', budget: '$', moods: [], time: 'quick', lat, lng: -74.004 }, extra);
  const stop = P('stop', ['parks'], 40.733);
  const pool = [stop];
  for (let i = 1; i <= 6; i++) pool.push(P('spot' + i, ['hidden'], 40.733 + i * 0.0005));
  pool.push(P('cafe', ['food'], 40.7395));
  const out = suggestNearPlan([stop], pool, pool, { limit: 5 });
  assert.equal(out.length, 5);
  assert.equal(out[4].item.id, 'cafe');
  const withFood = suggestNearPlan([stop, pool[7]], pool, pool, { limit: 5 });
  assert.ok(!withFood.some((r) => r.item.id === 'cafe'));
  pool[3].categories.push('date');
  assert.deepEqual(suggestNearPlan([stop], pool, pool, { keep: (it) => it.categories.includes('date') }).map((r) => r.item.id), ['spot3']);
});

test('date plans: a dessert spot is never the meal but can be the after-dinner stop', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  places.push({ id: 'gelato', name: 'gelato', categories: ['food', 'date'], area: 'West Village', budget: '$', moods: [], time: 'quick', lat: 40.7331, lng: -74.0041, dateWhen: ['evening', 'night'], outdoor: false, dessert: true });
  for (let r = 0; r < 1; r += 0.25) {
    const plan = generatePlan(places, { scope: 'date-evening' }, () => r, places);
    assert.notEqual(plan[1].id, 'gelato');
  }
  const plan = generatePlan(places, { scope: 'date-evening', budget: '$$$' }, () => 0, places);
  assert.equal(plan[2].id, 'gelato', 'closer than the jazz club');
});

test('date plans: the budget also caps the other stops, so a cheap date stays cheap', () => {
  const { generatePlan } = loadLogic();
  const places = datePlaces();
  places.find((p) => p.id === 'lunchspot').budget = '$';
  places.find((p) => p.id === 'pier').budget = '$$$';
  places.find((p) => p.id === 'promenade').budget = 'free';
  const plan = generatePlan(places, { scope: 'date-night', budget: '$' }, () => 0, places);
  assert.deepEqual(plan.map((p) => p.id), ['lunchspot', 'promenade'], 'the $$$ pier is over budget, the free promenade is not');
});

test('suggestNearPlan: once the plan has a meal, no second restaurant (desserts still fine); seasonal spots go last', () => {
  const { suggestNearPlan } = loadLogic();
  const P = (id, cats, lat, extra) => Object.assign({ id, name: id, categories: cats, area: 'West Village', budget: '$', moods: [], time: 'quick', lat, lng: -74.004 }, extra);
  const dinner = P('dinner', ['food', 'date'], 40.733);
  const pool = [dinner, P('bistro', ['food', 'date'], 40.7331), P('gelato', ['food', 'date'], 40.7332, { dessert: true }),
    P('rink', ['parks', 'date'], 40.7333, { seasonal: true }), P('pier', ['parks', 'date'], 40.737)];
  const ids = suggestNearPlan([dinner], pool, pool).map((r) => r.item.id);
  assert.deepEqual(ids, ['gelato', 'pier', 'rink']);
  const park = P('park', ['parks'], 40.733);
  const noMeal = suggestNearPlan([park], [park, P('gelato2', ['food'], 40.7331, { dessert: true }), P('bistro2', ['food'], 40.736)], pool, { limit: 1 });
  assert.deepEqual(noMeal.map((r) => r.item.id), ['bistro2'], 'a dessert is not the plan’s meal idea');
});
