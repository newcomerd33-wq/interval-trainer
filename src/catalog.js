// =============================================================================
// EXERCISE CATALOG
// -----------------------------------------------------------------------------
// A lightweight, mostly-invisible registry that gives each exercise a STABLE id
// independent of its display name. Journal entries store both `exerciseId` and
// `nameSnapshot`, so renaming "Goblet Squat" -> "Squat" later won't fork its
// history. v1 auto-creates entries from normalized names; a merge/rename UI can
// come later. Pure functions (no localStorage) so they're node-testable.
//
// Catalog entry shape:
//   { id, name, aliases: [], defaultMetricKind, defaultUnit, createdAt, updatedAt }
// =============================================================================

export const METRIC_KINDS = ['weight_reps', 'reps_only', 'time', 'distance_time', 'bands', 'freeform'];
export const DEFAULT_METRIC_KIND = 'weight_reps';
export const DEFAULT_UNIT = 'lb';

// Matching key: trim, collapse internal whitespace, lowercase. Display name is
// preserved separately — this is only for dedup/lookup.
export function normalizeExerciseName(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Find an existing catalog entry whose name or alias matches `name`.
export function findExercise(catalog, name) {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return (
    catalog.find(
      (e) => normalizeExerciseName(e.name) === key || (e.aliases || []).some((a) => normalizeExerciseName(a) === key)
    ) || null
  );
}

// Get-or-create. Returns { catalog, exercise } — `catalog` is a NEW array when an
// entry was added, otherwise the same reference. `idFn`/`now` are injectable for
// deterministic tests.
export function ensureExercise(catalog, name, opts = {}) {
  const list = catalog || [];
  const existing = findExercise(list, name);
  if (existing) return { catalog: list, exercise: existing };

  const idFn = opts.idFn || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const now = opts.now != null ? opts.now : Date.now();
  const exercise = {
    id: idFn(),
    name: String(name == null ? '' : name).trim(),
    aliases: [],
    defaultMetricKind: opts.defaultMetricKind || DEFAULT_METRIC_KIND,
    defaultUnit: opts.defaultUnit || DEFAULT_UNIT,
    createdAt: now,
    updatedAt: now,
  };
  return { catalog: [...list, exercise], exercise };
}

// Resolve a batch of names against the catalog in one pass, creating any that are
// missing. Returns { catalog, exercises } where `exercises` aligns with `names`.
export function ensureExercises(catalog, names, opts = {}) {
  let next = catalog || [];
  const exercises = [];
  for (const name of names) {
    const res = ensureExercise(next, name, opts);
    next = res.catalog;
    exercises.push(res.exercise);
  }
  return { catalog: next, exercises };
}
