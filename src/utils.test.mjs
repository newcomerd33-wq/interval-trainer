// Pure-function tests for the foundation utilities.
// No test framework dependency — uses Node's built-in runner (Node 18+):
//   npm test     (or)   node --test
//
// These modules are intentionally free of browser globals at import time, so
// they load fine under Node. (storage.js touches localStorage only inside the
// IO functions, which we don't call here.)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toLocalDateKey, fromDateKey, addDays, diffDays, dayOfWeek, startOfWeek, daysInMonth, rangeKeys } from './date.js';
import { normalizeExerciseName, ensureExercise, ensureExercises, findExercise } from './catalog.js';
import { exercisesForItem, expandSetsFromSlots } from './exercises.js';
import { buildBackup, parseBackup } from './storage.js';

// --- date ---------------------------------------------------------------------

test('toLocalDateKey formats local Y-M-D with zero padding', () => {
  // Construct via local-time components so the assertion is timezone-stable.
  assert.equal(toLocalDateKey(new Date(2026, 0, 5)), '2026-01-05'); // Jan 5
  assert.equal(toLocalDateKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('fromDateKey round-trips through toLocalDateKey', () => {
  assert.equal(toLocalDateKey(fromDateKey('2026-06-02')), '2026-06-02');
});

test('addDays / diffDays handle month + leap boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28'); // 2026 not a leap year
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // 2024 is a leap year
  assert.equal(diffDays('2026-06-01', '2026-06-08'), 7);
  assert.equal(diffDays('2026-06-08', '2026-06-01'), -7);
});

test('dayOfWeek / startOfWeek', () => {
  assert.equal(dayOfWeek('2026-06-02'), 2); // Tue
  assert.equal(startOfWeek('2026-06-02', 0), '2026-05-31'); // Sun
  assert.equal(startOfWeek('2026-06-02', 1), '2026-06-01'); // Mon
});

test('daysInMonth + rangeKeys', () => {
  assert.equal(daysInMonth('2026-02-15'), 28);
  assert.equal(daysInMonth('2024-02-15'), 29);
  assert.deepEqual(rangeKeys('2026-06-01', '2026-06-03'), ['2026-06-01', '2026-06-02', '2026-06-03']);
});

// --- catalog ------------------------------------------------------------------

test('normalizeExerciseName trims, collapses whitespace, lowercases', () => {
  assert.equal(normalizeExerciseName('  Goblet   Squat '), 'goblet squat');
  assert.equal(normalizeExerciseName('BENCH PRESS'), 'bench press');
  assert.equal(normalizeExerciseName(null), '');
});

test('ensureExercise creates once, reuses on match (case/space-insensitive)', () => {
  let seq = 0;
  const idFn = () => `id${++seq}`;
  let cat = [];
  let r = ensureExercise(cat, 'Goblet Squat', { idFn, now: 1 });
  cat = r.catalog;
  assert.equal(cat.length, 1);
  assert.equal(r.exercise.id, 'id1');
  assert.equal(r.exercise.defaultMetricKind, 'weight_reps');

  // a differently-cased/spaced name resolves to the same entry, no new id
  r = ensureExercise(cat, '  goblet   squat', { idFn, now: 2 });
  assert.equal(r.catalog.length, 1);
  assert.equal(r.exercise.id, 'id1');
});

test('findExercise matches aliases', () => {
  const cat = [{ id: 'x', name: 'Romanian Deadlift', aliases: ['RDL'], defaultMetricKind: 'weight_reps' }];
  assert.equal(findExercise(cat, 'rdl').id, 'x');
  assert.equal(findExercise(cat, 'unknown'), null);
});

test('ensureExercises resolves a batch, deduping repeats', () => {
  let seq = 0;
  const idFn = () => `id${++seq}`;
  const { catalog, exercises } = ensureExercises([], ['Squat', 'Bench', 'Squat'], { idFn });
  assert.equal(catalog.length, 2);
  assert.equal(exercises[0].id, exercises[2].id); // both "Squat"
});

// --- exercises derivation -----------------------------------------------------

test('expandSetsFromSlots groups by name, skips rest, collapses L/R into one set', () => {
  const slots = [
    { name: 'Squat', duration: 60 },
    { name: 'Squat', duration: 60 },
    { name: 'Lunge', duration: 60, side: 'L', unilateral: true },
    { name: 'Lunge', duration: 60, side: 'R', unilateral: true },
    { name: 'Rest', duration: 120, isRest: true },
  ];
  const out = expandSetsFromSlots(slots);
  assert.deepEqual(out, [
    { name: 'Squat', mode: 'standard', setCount: 2 },
    { name: 'Lunge', mode: 'unilateral', setCount: 1 }, // L+R = one set
  ]);
});

test('expandSetsFromSlots dedupes case/whitespace and prefers richer mode', () => {
  const slots = [
    { name: 'Squat', duration: 60 }, // standard
    { name: 'squat', duration: 60, side: 'L', unilateral: true }, // unilateral L
    { name: 'SQUAT ', duration: 60, side: 'R', unilateral: true }, // unilateral R (not a new set)
  ];
  assert.deepEqual(expandSetsFromSlots(slots), [
    { name: 'Squat', mode: 'unilateral', setCount: 2 }, // first display name kept, richest mode wins
  ]);
});

test('expandSetsFromSlots skips blank names', () => {
  const slots = [
    { name: '   ', duration: 60 },
    { name: '', duration: 60 },
    { name: 'Squat', duration: 60 },
  ];
  assert.deepEqual(expandSetsFromSlots(slots), [{ name: 'Squat', mode: 'standard', setCount: 1 }]);
});

test('exercisesForItem — custom dedupes case-insensitively', () => {
  const item = {
    sourceType: 'custom',
    custom: { circuits: [{ rounds: 2, restAfterSec: 0, exercises: [{ name: 'Squat', mode: 'standard' }, { name: 'squat', mode: 'unilateral' }] }] },
  };
  assert.deepEqual(exercisesForItem(item), [
    { name: 'Squat', mode: 'unilateral', setCount: 4 }, // merged: 2 + 2 rounds, richer mode
  ]);
});

test('exercisesForItem — custom multiplies by rounds', () => {
  const item = {
    sourceType: 'custom',
    custom: { circuits: [{ rounds: 3, restAfterSec: 0, exercises: [{ name: 'Push', mode: 'standard' }, { name: 'Pull', mode: 'unilateral' }] }] },
  };
  assert.deepEqual(exercisesForItem(item), [
    { name: 'Push', mode: 'standard', setCount: 3 },
    { name: 'Pull', mode: 'unilateral', setCount: 3 },
  ]);
});

test('exercisesForItem — rotation counts primary per accessory per round', () => {
  const item = {
    sourceType: 'rotation',
    rotation: { rounds: 5, intervalSec: 60, primary: { name: 'Squat', mode: 'standard' }, accessories: [{ name: 'Curl', mode: 'standard' }, { name: 'Row', mode: 'standard' }] },
  };
  const out = exercisesForItem(item);
  assert.deepEqual(out, [
    { name: 'Squat', mode: 'standard', setCount: 10 }, // 5 rounds * 2 accessories
    { name: 'Curl', mode: 'standard', setCount: 5 },
    { name: 'Row', mode: 'standard', setCount: 5 },
  ]);
});

test('exercisesForItem — preset reads blocks, maps types to modes', () => {
  const item = { sourceType: 'preset', configId: 'whatever', blocks: [{ type: 'B', name: 'Bench' }, { type: 'U', name: 'Split Squat' }, { type: 'A', name: 'Row' }] };
  assert.deepEqual(exercisesForItem(item), [
    { name: 'Bench', mode: 'standard', setCount: 1 },
    { name: 'Split Squat', mode: 'unilateral', setCount: 1 },
    { name: 'Row', mode: 'alternating', setCount: 1 },
  ]);
});

test('exercisesForItem — unknown/empty returns []', () => {
  assert.deepEqual(exercisesForItem(null), []);
  assert.deepEqual(exercisesForItem({ sourceType: 'preset' }), []);
});

// --- backup -------------------------------------------------------------------

test('buildBackup wraps stores with version + timestamp', () => {
  const b = buildBackup({ library: [1], exercises: [2], journal: [3], schedule: { rules: [], oneOffs: [], exceptions: [] } }, 1234);
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, 1234);
  assert.deepEqual(b.library, [1]);
});

test('buildBackup -> parseBackup round-trips', () => {
  const b = buildBackup({ library: [{ id: 'a' }], exercises: [], journal: [{ id: 'j' }], schedule: { rules: [{ id: 'r' }], oneOffs: [], exceptions: [] } }, 9);
  const p = parseBackup(b);
  assert.deepEqual(p.library, [{ id: 'a' }]);
  assert.deepEqual(p.schedule.rules, [{ id: 'r' }]);
});

test('parseBackup rejects junk and future versions', () => {
  assert.throws(() => parseBackup(null));
  assert.throws(() => parseBackup({ version: 999 }));
  assert.throws(() => parseBackup({ app: 'something-else', version: 1 }));
});

test('parseBackup tolerates missing schedule sub-lists', () => {
  const p = parseBackup({ version: 1, library: [], schedule: {} });
  assert.deepEqual(p.schedule, { rules: [], oneOffs: [], exceptions: [] });
});
