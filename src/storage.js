// =============================================================================
// STORAGE
// -----------------------------------------------------------------------------
// All app data lives in localStorage (no backend). This module centralizes the
// keys + load/save for every store and defines a single unified backup shape so
// each store never grows its own divergent export logic.
//
// NOTE: localStorage is only touched INSIDE functions, never at import time, so
// the pure helpers (buildBackup / parseBackup) remain importable under Node for
// tests. Existing App.jsx still owns the library via its own constant during the
// migration; this module reuses the SAME key string to stay in sync.
// =============================================================================

export const KEYS = {
  library: 'interval-trainer-library-v1',
  exercises: 'interval-trainer-exercises-v1',
  journal: 'interval-trainer-journal-v1',
  schedule: 'interval-trainer-schedule-v1',
};

// Default empty value per store. Schedule is an object of three lists; the rest
// are arrays.
export const EMPTY = {
  library: () => [],
  exercises: () => [],
  journal: () => [],
  schedule: () => ({ rules: [], oneOffs: [], exceptions: [] }),
};

// --- generic primitives ------------------------------------------------------

export function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// --- typed loaders / savers --------------------------------------------------

export const loadLibrary = () => loadStore(KEYS.library, EMPTY.library());
export const saveLibrary = (v) => saveStore(KEYS.library, v);

export const loadExercises = () => loadStore(KEYS.exercises, EMPTY.exercises());
export const saveExercises = (v) => saveStore(KEYS.exercises, v);

export const loadJournal = () => loadStore(KEYS.journal, EMPTY.journal());
export const saveJournal = (v) => saveStore(KEYS.journal, v);

export function loadSchedule() {
  const s = loadStore(KEYS.schedule, EMPTY.schedule());
  // tolerate partial/legacy objects
  return { rules: s.rules || [], oneOffs: s.oneOffs || [], exceptions: s.exceptions || [] };
}
export const saveSchedule = (v) => saveStore(KEYS.schedule, v);

// --- unified backup (pure) ---------------------------------------------------

export const BACKUP_VERSION = 1;

// Assemble a backup object from in-memory stores. Pure — caller supplies data.
export function buildBackup({ library, exercises, journal, schedule }, exportedAt = Date.now()) {
  return {
    app: 'interval-trainer',
    version: BACKUP_VERSION,
    exportedAt,
    library: library || EMPTY.library(),
    exercises: exercises || EMPTY.exercises(),
    journal: journal || EMPTY.journal(),
    schedule: schedule || EMPTY.schedule(),
  };
}

// Validate + normalize a parsed backup object. Throws on the obvious failures so
// import can surface a clear error instead of silently corrupting stores.
export function parseBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Backup is not an object');
  if (obj.app && obj.app !== 'interval-trainer') throw new Error('Backup is from a different app');
  if (typeof obj.version !== 'number') throw new Error('Backup is missing a version');
  if (obj.version > BACKUP_VERSION) throw new Error('Backup is from a newer version of the app');
  const sched = obj.schedule || EMPTY.schedule();
  return {
    version: obj.version,
    exportedAt: obj.exportedAt || null,
    library: Array.isArray(obj.library) ? obj.library : EMPTY.library(),
    exercises: Array.isArray(obj.exercises) ? obj.exercises : EMPTY.exercises(),
    journal: Array.isArray(obj.journal) ? obj.journal : EMPTY.journal(),
    schedule: {
      rules: Array.isArray(sched.rules) ? sched.rules : [],
      oneOffs: Array.isArray(sched.oneOffs) ? sched.oneOffs : [],
      exceptions: Array.isArray(sched.exceptions) ? sched.exceptions : [],
    },
  };
}

// --- backup IO (reads/writes all stores at once) -----------------------------

export function exportAll() {
  return buildBackup({
    library: loadLibrary(),
    exercises: loadExercises(),
    journal: loadJournal(),
    schedule: loadSchedule(),
  });
}

// Overwrites every store from a (already parsed + validated) backup.
export function importAll(backup) {
  const b = parseBackup(backup);
  saveLibrary(b.library);
  saveExercises(b.exercises);
  saveJournal(b.journal);
  saveSchedule(b.schedule);
  return b;
}
