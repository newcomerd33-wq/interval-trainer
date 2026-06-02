// Pure-function tests for the journal model/helpers (Commit A).
//   npm test   (or)   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEntry,
  normalizeOrigin,
  emptySet,
  emptyExercise,
  carryForwardSets,
  seedExercisesForLog,
  lastExerciseLogged,
  entriesForExercise,
  groupEntriesByDate,
  entrySummary,
  upsertEntry,
  removeEntry,
  withUpdatedAt,
  fieldsForMetric,
} from './journal.js';

// deterministic id generator
function seqIds() {
  let n = 0;
  return () => `id${++n}`;
}

// --- factories ---------------------------------------------------------------

test('createEntry stamps ids/timestamps and normalizes origin', () => {
  const e = createEntry(
    { sessionName: 'Leg Day', sourceType: 'custom', origin: { libraryId: 'lib1', viaTimer: true } },
    { idFn: seqIds(), now: 1000, today: '2026-06-02' }
  );
  assert.equal(e.id, 'id1');
  assert.equal(e.date, '2026-06-02');
  assert.equal(e.loggedAt, 1000);
  assert.equal(e.updatedAt, 1000);
  assert.equal(e.sessionName, 'Leg Day');
  assert.equal(e.sourceType, 'custom');
  assert.deepEqual(e.origin, { libraryId: 'lib1', scheduleRuleId: null, scheduleOneOffId: null, occurrenceDate: null, viaTimer: true });
  assert.deepEqual(e.exercises, []);
});

test('normalizeOrigin fills all keys with null/false defaults', () => {
  assert.deepEqual(normalizeOrigin(), { libraryId: null, scheduleRuleId: null, scheduleOneOffId: null, occurrenceDate: null, viaTimer: false });
});

test('emptySet has every metric field + extras, blank + not done', () => {
  const s = emptySet('weight_reps', { idFn: seqIds() });
  assert.equal(s.done, false);
  for (const f of ['weight', 'reps', 'rpe', 'timeSec', 'distance', 'value']) assert.equal(s[f], null);
  assert.deepEqual(s.extras, {});
});

test('emptyExercise seeds setCount sets (min handling)', () => {
  assert.equal(emptyExercise({ name: 'Squat', setCount: 3 }, { idFn: seqIds() }).sets.length, 3);
  assert.equal(emptyExercise({ name: 'Squat' }, { idFn: seqIds() }).sets.length, 1); // default 1
  assert.equal(emptyExercise({ name: 'Squat', setCount: 0 }, { idFn: seqIds() }).sets.length, 0);
});

test('fieldsForMetric falls back for unknown kind', () => {
  assert.deepEqual(fieldsForMetric('time'), ['timeSec']);
  assert.deepEqual(fieldsForMetric('nonsense'), ['weight', 'reps', 'rpe']);
});

// --- carry-forward -----------------------------------------------------------

test('carryForwardSets with no prior returns blank sets', () => {
  const sets = carryForwardSets(null, 'weight_reps', 2, { idFn: seqIds() });
  assert.equal(sets.length, 2);
  assert.equal(sets[0].weight, null);
});

test('carryForwardSets same kind copies values, resets done, drops rpe', () => {
  const prev = { metricKind: 'weight_reps', sets: [{ weight: 100, reps: 5, rpe: 8, done: true }, { weight: 110, reps: 4, rpe: 9, done: true }] };
  const sets = carryForwardSets(prev, 'weight_reps', 2, { idFn: seqIds() });
  assert.equal(sets[0].weight, 100);
  assert.equal(sets[0].reps, 5);
  assert.equal(sets[0].rpe, null); // rpe never carried
  assert.equal(sets[0].done, false); // reset
  assert.equal(sets[1].weight, 110);
});

test('carryForwardSets pads with last prior set and truncates', () => {
  const prev = { metricKind: 'weight_reps', sets: [{ weight: 100, reps: 5 }, { weight: 110, reps: 4 }] };
  const padded = carryForwardSets(prev, 'weight_reps', 4, { idFn: seqIds() });
  assert.equal(padded.length, 4);
  assert.equal(padded[3].weight, 110); // padded from last
  const trunc = carryForwardSets(prev, 'weight_reps', 1, { idFn: seqIds() });
  assert.equal(trunc.length, 1);
  assert.equal(trunc[0].weight, 100);
});

test('carryForwardSets across different kinds only carries overlapping fields', () => {
  const prev = { metricKind: 'distance_time', sets: [{ distance: 5, timeSec: 1200, weight: null }] };
  // new kind 'time' overlaps on timeSec only
  const sets = carryForwardSets(prev, 'time', 1, { idFn: seqIds() });
  assert.equal(sets[0].timeSec, 1200);
  assert.equal(sets[0].distance, null); // not a field of 'time'
  // new kind 'weight_reps' has zero overlap -> all blank
  const none = carryForwardSets(prev, 'weight_reps', 1, { idFn: seqIds() });
  assert.equal(none[0].weight, null);
  assert.equal(none[0].reps, null);
});

test('carryForwardSets default count uses prior set length', () => {
  const prev = { metricKind: 'reps_only', sets: [{ reps: 10 }, { reps: 9 }, { reps: 8 }] };
  assert.equal(carryForwardSets(prev, 'reps_only', null, { idFn: seqIds() }).length, 3);
});

// --- lookups -----------------------------------------------------------------

const journalFixture = [
  { id: 'e1', date: '2026-05-30', loggedAt: 10, exercises: [{ exerciseId: 'sq', metricKind: 'weight_reps', unit: 'lb', sets: [{ weight: 200, reps: 5 }] }] },
  { id: 'e2', date: '2026-06-01', loggedAt: 20, exercises: [{ exerciseId: 'sq', metricKind: 'weight_reps', unit: 'lb', sets: [{ weight: 210, reps: 5 }] }] },
  { id: 'e3', date: '2026-06-03', loggedAt: 30, exercises: [{ exerciseId: 'sq', metricKind: 'weight_reps', unit: 'lb', sets: [{ weight: 225, reps: 5 }] }] },
];

test('lastExerciseLogged returns most recent overall', () => {
  assert.equal(lastExerciseLogged(journalFixture, 'sq').sets[0].weight, 225);
});

test('lastExerciseLogged honors beforeDate ceiling (no newer)', () => {
  // editing the 06-01 entry should not see 06-03
  const ex = lastExerciseLogged(journalFixture, 'sq', { beforeDate: '2026-06-01', excludeId: 'e2' });
  assert.equal(ex.sets[0].weight, 200); // the 05-30 one
});

test('lastExerciseLogged excludeId skips self', () => {
  const ex = lastExerciseLogged(journalFixture, 'sq', { excludeId: 'e3' });
  assert.equal(ex.sets[0].weight, 210);
});

test('entriesForExercise returns oldest-first history', () => {
  const hist = entriesForExercise(journalFixture, 'sq');
  assert.deepEqual(hist.map((h) => h.exercise.sets[0].weight), [200, 210, 225]);
});

// --- seedExercisesForLog -----------------------------------------------------

test('seedExercisesForLog ensures catalog + carries forward by exerciseId', () => {
  const idFn = seqIds();
  const catalog = [{ id: 'sq', name: 'Squat', aliases: [], defaultMetricKind: 'weight_reps', defaultUnit: 'lb' }];
  const journal = [{ id: 'p', date: '2026-06-01', loggedAt: 5, exercises: [{ exerciseId: 'sq', metricKind: 'weight_reps', unit: 'kg', sets: [{ weight: 140, reps: 3 }] }] }];
  const derived = [{ name: 'squat', mode: 'standard', setCount: 2 }, { name: 'Lunge', mode: 'unilateral', setCount: 1 }];

  const { catalog: cat, exercises } = seedExercisesForLog({ derived, catalog, journal, beforeDate: '2026-06-02' }, { idFn });

  // 'squat' matched existing 'Squat' (case-insensitive) -> reused id, carried unit + weight
  assert.equal(exercises[0].exerciseId, 'sq');
  assert.equal(exercises[0].unit, 'kg'); // carried from prior log, not catalog default
  assert.equal(exercises[0].sets.length, 2);
  assert.equal(exercises[0].sets[0].weight, 140);
  assert.equal(exercises[0].sets[1].weight, 140); // padded
  assert.equal(exercises[0].nameSnapshot, 'squat'); // exact name used today

  // 'Lunge' is new -> catalog grew, blank sets
  assert.equal(cat.length, 2);
  assert.equal(exercises[1].sets[0].reps, null);
});

// --- grouping + summary ------------------------------------------------------

test('groupEntriesByDate buckets today/yesterday/this week/month, newest first', () => {
  const journal = [
    { id: 'a', date: '2026-06-02', loggedAt: 3 },
    { id: 'b', date: '2026-06-01', loggedAt: 2 },
    { id: 'c', date: '2026-05-28', loggedAt: 1 },
    { id: 'd', date: '2026-04-10', loggedAt: 0 },
  ];
  const groups = groupEntriesByDate(journal, { today: '2026-06-02' });
  assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', 'Earlier this week', 'April 2026']);
  assert.equal(groups[0].entries[0].id, 'a');
});

test('entrySummary derives counts + heaviest weight_reps headline', () => {
  const entry = {
    exercises: [
      { nameSnapshot: 'Squat', metricKind: 'weight_reps', unit: 'lb', sets: [{ weight: 200, reps: 5 }, { weight: 225, reps: 3 }] },
      { nameSnapshot: 'Plank', metricKind: 'time', unit: 'lb', sets: [{ timeSec: 60 }] },
    ],
  };
  const s = entrySummary(entry);
  assert.equal(s.exerciseCount, 2);
  assert.equal(s.totalSets, 3);
  assert.deepEqual(s.headline, { name: 'Squat', weight: 225, reps: 3, unit: 'lb' });
});

test('entrySummary headline is null when no weight logged', () => {
  const s = entrySummary({ exercises: [{ nameSnapshot: 'Run', metricKind: 'distance_time', sets: [{ distance: 5, timeSec: 1500 }] }] });
  assert.equal(s.headline, null);
  assert.equal(s.totalSets, 1);
});

// --- list ops ----------------------------------------------------------------

test('upsertEntry prepends new, replaces existing in place', () => {
  const j0 = [{ id: 'x', v: 1 }];
  const j1 = upsertEntry(j0, { id: 'y', v: 2 });
  assert.deepEqual(j1.map((e) => e.id), ['y', 'x']); // prepended
  const j2 = upsertEntry(j1, { id: 'x', v: 9 });
  assert.deepEqual(j2.map((e) => e.id), ['y', 'x']); // order preserved
  assert.equal(j2.find((e) => e.id === 'x').v, 9); // replaced
});

test('removeEntry drops by id', () => {
  assert.deepEqual(removeEntry([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
});

test('withUpdatedAt bumps only updatedAt', () => {
  const e = { id: 'a', loggedAt: 1, updatedAt: 1, foo: 'bar' };
  const u = withUpdatedAt(e, 99);
  assert.equal(u.updatedAt, 99);
  assert.equal(u.loggedAt, 1);
  assert.equal(u.foo, 'bar');
});
