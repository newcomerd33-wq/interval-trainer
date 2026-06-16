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
  folders: 'interval-trainer-folders-v1',
  exercises: 'interval-trainer-exercises-v1',
  journal: 'interval-trainer-journal-v1',
  schedule: 'interval-trainer-schedule-v1',
  // Crash-recovery only: the in-progress workout log. Deliberately NOT part of
  // the backup shape — it's transient session state, not durable data.
  activeLog: 'interval-trainer-active-log-v1',
};

// Default empty value per store. Schedule is an object of three lists; the rest
// are arrays.
export const EMPTY = {
  library: () => [],
  folders: () => [],
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

export const loadFolders = () => loadStore(KEYS.folders, EMPTY.folders());
export const saveFolders = (v) => saveStore(KEYS.folders, v);

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

// Active in-progress workout log (crash recovery). Null when none. Not backed up.
export const loadActiveLog = () => loadStore(KEYS.activeLog, null);
export const saveActiveLog = (v) => saveStore(KEYS.activeLog, v);
export function clearActiveLog() {
  try { localStorage.removeItem(KEYS.activeLog); } catch {}
}

// --- unified backup (pure) ---------------------------------------------------

// v2 adds the `folders` store. A v1 backup (no folders) still imports cleanly —
// parseBackup defaults it to []. Bumping means an OLDER app build will refuse a
// v2 backup ("newer version"), which is the correct, safe direction.
export const BACKUP_VERSION = 2;

// Assemble a backup object from in-memory stores. Pure — caller supplies data.
export function buildBackup({ library, folders, exercises, journal, schedule }, exportedAt = Date.now()) {
  return {
    app: 'interval-trainer',
    version: BACKUP_VERSION,
    exportedAt,
    library: library || EMPTY.library(),
    folders: folders || EMPTY.folders(),
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
    folders: Array.isArray(obj.folders) ? obj.folders : EMPTY.folders(),
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
    folders: loadFolders(),
    exercises: loadExercises(),
    journal: loadJournal(),
    schedule: loadSchedule(),
  });
}

// Overwrites every durable store from a (already parsed + validated) backup.
// Clears any active in-progress draft — it belongs to the pre-import session and
// would be mismatched against the restored data.
export function importAll(backup) {
  const b = parseBackup(backup);
  saveLibrary(b.library);
  saveFolders(b.folders);
  saveExercises(b.exercises);
  saveJournal(b.journal);
  saveSchedule(b.schedule);
  clearActiveLog();
  return b;
}
