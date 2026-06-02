// =============================================================================
// SCHEDULE MODEL + RESOLVER
// -----------------------------------------------------------------------------
// Pure functions over the schedule store: { rules, oneOffs, exceptions }.
// No localStorage, no React. The resolver expands recurring rules across a date
// range, merges one-offs, and applies skip exceptions. "Done" is NOT tracked
// here — it's derived from the journal (scheduledDoneKeys), so this stays pure.
//
//   rule      { id, libraryId, name, kind:'weekly'|'everyN',
//               daysOfWeek[], intervalDays, anchorDate, startDate, endDate, createdAt }
//   oneOff    { id, date, libraryId, name, status:'planned'|'done'|'skipped', linkedEntryId, createdAt }
//   exception { ruleId, date }            // skip one rule occurrence; move = skip + oneOff
//
// Occurrence (resolver output) carries a stable synthetic id:
//   rule:    `rule:${ruleId}:${date}`
//   oneoff:  `oneoff:${oneOffId}`
// =============================================================================

import { rangeKeys, dayOfWeek, diffDays } from './date.js';

export const ruleOccurrenceId = (ruleId, dateKey) => `rule:${ruleId}:${dateKey}`;
export const oneOffOccurrenceId = (oneOffId) => `oneoff:${oneOffId}`;

// Does a recurring rule fall on this date key (honoring bounds)?
export function ruleMatchesDate(rule, dateKey) {
  if (!rule) return false;
  if (rule.startDate && dateKey < rule.startDate) return false;
  if (rule.endDate && dateKey > rule.endDate) return false;
  if (rule.kind === 'weekly') return (rule.daysOfWeek || []).includes(dayOfWeek(dateKey));
  if (rule.kind === 'everyN') {
    if (!rule.anchorDate || !(rule.intervalDays > 0)) return false;
    const d = diffDays(rule.anchorDate, dateKey);
    return d >= 0 && d % rule.intervalDays === 0;
  }
  return false;
}

// Expand the schedule into a flat, date-sorted occurrence list for [start, end].
export function occurrencesInRange(schedule, startKey, endKey) {
  const { rules = [], oneOffs = [], exceptions = [] } = schedule || {};
  const skip = new Set(exceptions.map((e) => `${e.ruleId}:${e.date}`));
  const out = [];

  for (const dateKey of rangeKeys(startKey, endKey)) {
    for (const rule of rules) {
      if (!ruleMatchesDate(rule, dateKey)) continue;
      if (skip.has(`${rule.id}:${dateKey}`)) continue;
      out.push({
        id: ruleOccurrenceId(rule.id, dateKey),
        date: dateKey,
        libraryId: rule.libraryId,
        name: rule.name,
        source: 'rule',
        ruleId: rule.id,
        oneOffId: null,
        status: 'planned',
      });
    }
  }

  for (const o of oneOffs) {
    if (diffDays(startKey, o.date) < 0 || diffDays(o.date, endKey) < 0) continue; // outside range
    out.push({
      id: oneOffOccurrenceId(o.id),
      date: o.date,
      libraryId: o.libraryId,
      name: o.name,
      source: 'oneoff',
      ruleId: null,
      oneOffId: o.id,
      status: o.status || 'planned',
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

// Occurrence ids that have a linked journal entry (done). Pure over the journal;
// the calendar overlays this onto occurrencesInRange() output.
export function scheduledDoneKeys(journal) {
  const keys = new Set();
  for (const e of journal || []) {
    const o = e.origin || {};
    if (o.scheduleOneOffId) keys.add(oneOffOccurrenceId(o.scheduleOneOffId));
    if (o.scheduleRuleId && o.occurrenceDate) keys.add(ruleOccurrenceId(o.scheduleRuleId, o.occurrenceDate));
  }
  return keys;
}

// --- CRUD (pure list ops; callers supply fully-built rule/oneOff objects) -----

export function addRule(schedule, rule) {
  return { ...schedule, rules: [...(schedule.rules || []), rule] };
}

// Removing a rule also drops its now-orphaned exceptions.
export function removeRule(schedule, ruleId) {
  return {
    ...schedule,
    rules: (schedule.rules || []).filter((r) => r.id !== ruleId),
    exceptions: (schedule.exceptions || []).filter((e) => e.ruleId !== ruleId),
  };
}

export function addOneOff(schedule, oneOff) {
  return { ...schedule, oneOffs: [...(schedule.oneOffs || []), oneOff] };
}

export function removeOneOff(schedule, id) {
  return { ...schedule, oneOffs: (schedule.oneOffs || []).filter((o) => o.id !== id) };
}

export function setOneOffStatus(schedule, id, status) {
  return { ...schedule, oneOffs: (schedule.oneOffs || []).map((o) => (o.id === id ? { ...o, status } : o)) };
}

// Skip one rule occurrence (idempotent on the ruleId:date pair).
export function addException(schedule, ruleId, date) {
  const exists = (schedule.exceptions || []).some((e) => e.ruleId === ruleId && e.date === date);
  if (exists) return schedule;
  return { ...schedule, exceptions: [...(schedule.exceptions || []), { ruleId, date }] };
}

export function removeException(schedule, ruleId, date) {
  return { ...schedule, exceptions: (schedule.exceptions || []).filter((e) => !(e.ruleId === ruleId && e.date === date)) };
}
