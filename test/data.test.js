'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadLogic } = require('./extract');

const CATS = ['iconic', 'museums', 'parks', 'food', 'neighborhoods', 'shows', 'hidden', 'free'];
const BUD = ['free', '$', '$$', '$$$'];
const TIME = ['quick', 'half', 'full'];

test('seed items are well-formed and ids unique', () => {
  const { SEED } = loadLogic();
  assert.ok(SEED.length >= 45, 'seed too small: ' + SEED.length);
  const ids = new Set();
  for (const it of SEED) {
    assert.ok(it.id && !ids.has(it.id), 'dup or missing id: ' + it.id);
    ids.add(it.id);
    assert.ok(CATS.includes(it.category), 'bad category: ' + it.category);
    assert.ok(BUD.includes(it.budget), 'bad budget on ' + it.id + ': ' + it.budget);
    assert.ok(TIME.includes(it.time), 'bad time on ' + it.id + ': ' + it.time);
    assert.ok(Array.isArray(it.moods) && it.moods.length >= 1, 'moods on ' + it.id);
    assert.ok(it.name && it.emoji && it.area && it.blurb, 'missing field on ' + it.id);
  }
});

test('coverage: every category present and Jersey City included', () => {
  const { SEED } = loadLogic();
  for (const c of CATS) assert.ok(SEED.some(i => i.category === c), 'missing category ' + c);
  assert.ok(SEED.some(i => i.area === 'Jersey City'), 'no Jersey City spot');
});

test('KB has substantial coverage and array moods', () => {
  const { KB } = loadLogic();
  const keys = Object.keys(KB);
  assert.ok(keys.length >= 120, 'KB too small: ' + keys.length);
  for (const k of keys) assert.ok(Array.isArray(KB[k].moods), 'KB moods not array: ' + k);
});
