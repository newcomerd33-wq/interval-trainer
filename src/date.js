// =============================================================================
// DATE UTILITIES
// -----------------------------------------------------------------------------
// All dates in the journal/schedule are stored as local "date keys" — a plain
// 'YYYY-MM-DD' string anchored to the user's local calendar day. We deliberately
// do NOT use Date.toISOString() (that's UTC and drifts across midnight in most
// timezones). These helpers are pure except where a default `new Date()` is used.
// =============================================================================

const pad2 = (n) => String(n).padStart(2, '0');

// A Date (or now) -> 'YYYY-MM-DD' in LOCAL time.
export function toLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Today's local date key.
export function todayKey() {
  return toLocalDateKey(new Date());
}

// 'YYYY-MM-DD' -> Date at LOCAL midnight of that day.
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight
}

// Shift a date key by n days (n may be negative). Returns a new key.
export function addDays(key, n) {
  const dt = fromDateKey(key);
  dt.setDate(dt.getDate() + n);
  return toLocalDateKey(dt);
}

// Whole-day difference b - a (in days). Both are date keys.
export function diffDays(a, b) {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

// 0 = Sunday ... 6 = Saturday, for a date key.
export function dayOfWeek(key) {
  return fromDateKey(key).getDay();
}

export function isSameDay(a, b) {
  return a === b;
}

// First day of the month containing `key`, as a key.
export function startOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return `${y}-${pad2(m)}-01`;
}

// Number of days in the month containing `key`.
export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
}

// Start of the week (as a key) containing `key`. weekStartsOn: 0=Sun (default), 1=Mon.
export function startOfWeek(key, weekStartsOn = 0) {
  const dow = dayOfWeek(key);
  const back = (dow - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

// Inclusive list of date keys from `startKey` to `endKey`.
export function rangeKeys(startKey, endKey) {
  const out = [];
  for (let k = startKey; diffDays(k, endKey) >= 0; k = addDays(k, 1)) out.push(k);
  return out;
}
