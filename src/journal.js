// =============================================================================
// JOURNAL MODEL + HELPERS
// -----------------------------------------------------------------------------
// Pure functions only — NO localStorage, NO React, NO app-state assumptions.
// IDs/timestamps/"today" are injectable (idFn / now / today) so every function
// is deterministic under test. The App layer owns persistence and wiring.
//
// Entry shape (see Step 2 sub-plan):
//   { id, date, loggedAt, updatedAt, sessionName, sourceType, durationMin,
//     origin:{ libraryId, scheduleRuleId, scheduleOneOffId, occurrenceDate, viaTimer },
//     sessionRPE, bodyweight, bodyweightUnit, notes,
//     exercises:[{ id, exerciseId, nameSnapshot, mode, metricKind, unit, note,
//                  sets:[{ id, done, weight, reps, rpe, timeSec, distance, value, extras }] }] }
// =============================================================================

import { todayKey, diffDays } from './date.js';
import { ensureExercise, DEFAULT_METRIC_KIND, DEFAULT_UNIT } from './catalog.js';

const defaultId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Which set fields each metric kind surfaces in the editor. (All fields always
// exist on a set; this only drives display + carry-forward overlap.)
export const METRIC_FIELDS = {
  weight_reps: ['weight', 'reps', 'rpe'],
  reps_only: ['reps', 'rpe'],
  time: ['timeSec'],
  distance_time: ['distance', 'timeSec'],
  freeform: ['value'],
};

// RPE is a per-performance feeling, not a target — never carried forward.
const CARRY_EXCLUDE = new Set(['rpe']);

export function fieldsForMetric(kind) {
  return METRIC_FIELDS[kind] || METRIC_FIELDS[DEFAULT_METRIC_KIND];
}

// --- factories ---------------------------------------------------------------

export function emptySet(metricKind = DEFAULT_METRIC_KIND, opts = {}) {
  const idFn = opts.idFn || defaultId;
  return {
    id: idFn(),
    done: false,
    weight: null,
    reps: null,
    rpe: null,
    timeSec: null,
    distance: null,
    value: null,
    extras: {},
  };
}

export function emptyExercise(spec = {}, opts = {}) {
  const idFn = opts.idFn || defaultId;
  const metricKind = spec.metricKind || DEFAULT_METRIC_KIND;
  const count = Math.max(0, spec.setCount == null ? 1 : spec.setCount);
  return {
    id: idFn(),
    exerciseId: spec.exerciseId || null,
    nameSnapshot: spec.name || spec.nameSnapshot || '',
    mode: spec.mode || 'standard',
    metricKind,
    unit: spec.unit || DEFAULT_UNIT,
    note: '',
    sets: Array.from({ length: count }, () => emptySet(metricKind, { idFn })),
  };
}

export function normalizeOrigin(o = {}) {
  return {
    libraryId: o.libraryId ?? null,
    scheduleRuleId: o.scheduleRuleId ?? null,
    scheduleOneOffId: o.scheduleOneOffId ?? null,
    occurrenceDate: o.occurrenceDate ?? null,
    viaTimer: !!o.viaTimer,
  };
}

export function createEntry(spec = {}, opts = {}) {
  const idFn = opts.idFn || defaultId;
  const now = opts.now != null ? opts.now : Date.now();
  return {
    id: idFn(),
    date: spec.date || opts.today || todayKey(),
    loggedAt: now,
    updatedAt: now,
    sessionName: spec.sessionName || '',
    sourceType: spec.sourceType || 'adhoc',
    durationMin: spec.durationMin ?? null,
    origin: normalizeOrigin(spec.origin),
    sessionRPE: spec.sessionRPE ?? null,
    bodyweight: spec.bodyweight ?? null,
    bodyweightUnit: spec.bodyweightUnit || DEFAULT_UNIT,
    notes: spec.notes || '',
    exercises: spec.exercises || [],
  };
}

export function withUpdatedAt(entry, now) {
  return { ...entry, updatedAt: now == null ? Date.now() : now };
}

// --- lookups (pure, read-only over a journal array) --------------------------

function cmpEntryDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.loggedAt || 0) - (a.loggedAt || 0);
}

// Most recent logged instance of an exercise (the exercise sub-object), honoring
// a `beforeDate` ceiling (calendar day <=, so same-day earlier sessions count)
// and an `excludeId` so an entry never reads itself while being edited.
export function lastExerciseLogged(journal, exerciseId, opts = {}) {
  const { beforeDate, excludeId } = opts;
  const sorted = [...(journal || [])].sort(cmpEntryDesc);
  for (const e of sorted) {
    if (excludeId && e.id === excludeId) continue;
    if (beforeDate && e.date > beforeDate) continue;
    const ex = (e.exercises || []).find((x) => x.exerciseId === exerciseId);
    if (ex) return ex;
  }
  return null;
}

// All logged instances of an exercise, oldest-first — for trends/charts later.
export function entriesForExercise(journal, exerciseId) {
  const out = [];
  for (const e of journal || []) {
    const ex = (e.exercises || []).find((x) => x.exerciseId === exerciseId);
    if (ex) out.push({ date: e.date, loggedAt: e.loggedAt, entryId: e.id, exercise: ex });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.loggedAt || 0) - (b.loggedAt || 0)));
}

// --- carry-forward -----------------------------------------------------------

// Seed `setCount` sets for an exercise, pre-filling from the previous time it was
// logged. Rules:
//   - no prior            -> blank sets
//   - same metricKind     -> copy carryable fields (NOT rpe, NOT done)
//   - different metricKind -> copy only fields valid in BOTH kinds (no coercion)
//   - pad with the last prior set; truncate if fewer wanted
export function carryForwardSets(prevExercise, metricKind, setCount, opts = {}) {
  const idFn = opts.idFn || defaultId;
  const count = Math.max(0, setCount == null ? (prevExercise?.sets?.length || 1) : setCount);

  const prevSets = prevExercise?.sets || [];
  if (!prevExercise || prevSets.length === 0) {
    return Array.from({ length: count }, () => emptySet(metricKind, { idFn }));
  }

  const target = fieldsForMetric(metricKind);
  const source = fieldsForMetric(prevExercise.metricKind);
  const carry = target.filter((f) => source.includes(f) && !CARRY_EXCLUDE.has(f));

  return Array.from({ length: count }, (_, i) => {
    const src = prevSets[Math.min(i, prevSets.length - 1)];
    const next = emptySet(metricKind, { idFn });
    for (const f of carry) next[f] = src[f] ?? null;
    return next; // done stays false
  });
}

// Combine derived exercises ({name, mode, setCount}) + catalog + journal into
// ready-to-edit exercise rows, ensuring catalog entries and carrying forward.
// Returns { catalog, exercises } — pure (ensureExercise returns a new catalog).
export function seedExercisesForLog({ derived, catalog, journal, beforeDate, excludeId }, opts = {}) {
  const idFn = opts.idFn || defaultId;
  let cat = catalog || [];
  const exercises = [];

  for (const d of derived || []) {
    const res = ensureExercise(cat, d.name, { idFn });
    cat = res.catalog;
    const cx = res.exercise;

    const prevEx = lastExerciseLogged(journal, cx.id, { beforeDate, excludeId });
    const metricKind = prevEx?.metricKind || cx.defaultMetricKind || DEFAULT_METRIC_KIND;
    const unit = prevEx?.unit || cx.defaultUnit || DEFAULT_UNIT;
    const sets = carryForwardSets(prevEx, metricKind, d.setCount, { idFn });

    exercises.push({
      id: idFn(),
      exerciseId: cx.id,
      nameSnapshot: d.name,
      mode: d.mode || 'standard',
      metricKind,
      unit,
      note: '',
      sets,
    });
  }

  return { catalog: cat, exercises };
}

// --- list ops ----------------------------------------------------------------

export function upsertEntry(journal, entry) {
  const list = journal || [];
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx === -1) return [entry, ...list];
  const next = list.slice();
  next[idx] = entry;
  return next;
}

export function removeEntry(journal, id) {
  return (journal || []).filter((e) => e.id !== id);
}

// --- display helpers (pure) --------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(dateKey) {
  const [y, m] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Group entries into date buckets, newest first. `today` injectable for tests.
export function groupEntriesByDate(journal, opts = {}) {
  const today = opts.today || todayKey();
  const sorted = [...(journal || [])].sort(cmpEntryDesc);
  const buckets = [];
  const byKey = new Map();

  const bucketFor = (dateKey) => {
    const d = diffDays(dateKey, today); // today - dateKey (>=0 for past)
    if (d <= 0) return { key: 'today', label: 'Today' };
    if (d === 1) return { key: 'yesterday', label: 'Yesterday' };
    if (d <= 6) return { key: 'thisweek', label: 'Earlier this week' };
    return { key: `m:${monthLabel(dateKey)}`, label: monthLabel(dateKey) };
  };

  for (const e of sorted) {
    const b = bucketFor(e.date);
    let bucket = byKey.get(b.key);
    if (!bucket) {
      bucket = { key: b.key, label: b.label, entries: [] };
      byKey.set(b.key, bucket);
      buckets.push(bucket);
    }
    bucket.entries.push(e);
  }
  return buckets;
}

// One-line stats for a history row. Returns data, not a formatted string, so the
// view controls presentation.
export function entrySummary(entry) {
  const exercises = entry.exercises || [];
  const exerciseCount = exercises.length;
  let totalSets = 0;
  let headline = null; // { name, weight, reps, unit }

  for (const ex of exercises) {
    const sets = ex.sets || [];
    totalSets += sets.length;
    if (ex.metricKind === 'weight_reps') {
      for (const s of sets) {
        if (s.weight == null) continue;
        if (!headline || s.weight > headline.weight) {
          headline = { name: ex.nameSnapshot, weight: s.weight, reps: s.reps ?? null, unit: ex.unit };
        }
      }
    }
  }
  return { exerciseCount, totalSets, headline };
}
