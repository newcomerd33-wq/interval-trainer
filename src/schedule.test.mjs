// Pure-function tests for the schedule model + resolver.
//   npm test   (or)   node --test
//
// Date anchors (local): 2026-06-01 = Mon(1), 06-02 Tue(2), 06-03 Wed(3),
// 06-04 Thu(4), 06-05 Fri(5), 06-06 Sat(6), 06-07 Sun(0), 06-08 Mon(1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  occurrencesInRange,
  scheduledDoneKeys,
  ruleMatchesDate,
  addRule,
  removeRule,
  addOneOff,
  removeOneOff,
  setOneOffStatus,
  addException,
  removeException,
} from './schedule.js';

const weeklyRule = { id: 'r1', libraryId: 'libA', name: 'Squat day', kind: 'weekly', daysOfWeek: [1, 3, 5] }; // Mon/Wed/Fri
const everyNRule = { id: 'r2', libraryId: 'libB', name: 'Conditioning', kind: 'everyN', intervalDays: 3, anchorDate: '2026-06-01' };

// --- ruleMatchesDate ---------------------------------------------------------

test('weekly rule matches its days of week', () => {
  assert.equal(ruleMatchesDate(weeklyRule, '2026-06-01'), true); // Mon
  assert.equal(ruleMatchesDate(weeklyRule, '2026-06-02'), false); // Tue
  assert.equal(ruleMatchesDate(weeklyRule, '2026-06-03'), true); // Wed
});

test('everyN rule matches every N days from the anchor, not before it', () => {
  assert.equal(ruleMatchesDate(everyNRule, '2026-06-01'), true); // d0
  assert.equal(ruleMatchesDate(everyNRule, '2026-06-02'), false); // d1
  assert.equal(ruleMatchesDate(everyNRule, '2026-06-04'), true); // d3
  assert.equal(ruleMatchesDate(everyNRule, '2026-05-29'), false); // before anchor
});

test('rule bounds (startDate/endDate) gate matches', () => {
  const bounded = { ...weeklyRule, startDate: '2026-06-03', endDate: '2026-06-05' };
  assert.equal(ruleMatchesDate(bounded, '2026-06-01'), false); // before start (Mon)
  assert.equal(ruleMatchesDate(bounded, '2026-06-03'), true); // Wed in range
  assert.equal(ruleMatchesDate(bounded, '2026-06-08'), false); // after end (Mon)
});

// --- occurrencesInRange ------------------------------------------------------

test('weekly expands across a range with stable ids', () => {
  const occ = occurrencesInRange({ rules: [weeklyRule] }, '2026-06-01', '2026-06-07');
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-03', '2026-06-05']);
  assert.equal(occ[0].id, 'rule:r1:2026-06-01');
  assert.equal(occ[0].source, 'rule');
  assert.equal(occ[0].libraryId, 'libA');
});

test('everyN expands across a range', () => {
  const occ = occurrencesInRange({ rules: [everyNRule] }, '2026-06-01', '2026-06-10');
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-04', '2026-06-07', '2026-06-10']);
});

test('exceptions suppress a rule occurrence', () => {
  const sched = { rules: [weeklyRule], exceptions: [{ ruleId: 'r1', date: '2026-06-03' }] };
  const occ = occurrencesInRange(sched, '2026-06-01', '2026-06-07');
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-05']); // Wed skipped
});

test('one-offs appear in range, excluded outside, carry status + id', () => {
  const sched = {
    oneOffs: [
      { id: 'o1', date: '2026-06-04', libraryId: 'libC', name: 'Extra', status: 'planned' },
      { id: 'o2', date: '2026-07-01', libraryId: 'libC', name: 'Future', status: 'planned' },
      { id: 'o3', date: '2026-06-06', libraryId: 'libC', name: 'Skipped one', status: 'skipped' },
    ],
  };
  const occ = occurrencesInRange(sched, '2026-06-01', '2026-06-07');
  assert.deepEqual(occ.map((o) => o.id).sort(), ['oneoff:o1', 'oneoff:o3']);
  assert.equal(occ.find((o) => o.id === 'oneoff:o3').status, 'skipped');
});

test('range bounds are inclusive on both ends', () => {
  const sched = { oneOffs: [
    { id: 'a', date: '2026-06-01', libraryId: 'l', name: 'start' },
    { id: 'b', date: '2026-06-07', libraryId: 'l', name: 'end' },
  ] };
  const occ = occurrencesInRange(sched, '2026-06-01', '2026-06-07');
  assert.equal(occ.length, 2);
});

test('rules + one-offs merge and sort by date', () => {
  const sched = {
    rules: [weeklyRule],
    oneOffs: [{ id: 'o1', date: '2026-06-02', libraryId: 'libC', name: 'Tue extra' }],
  };
  const occ = occurrencesInRange(sched, '2026-06-01', '2026-06-03');
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
});

// --- scheduledDoneKeys -------------------------------------------------------

test('scheduledDoneKeys maps journal origins to occurrence ids', () => {
  const journal = [
    { id: 'e1', origin: { scheduleRuleId: 'r1', occurrenceDate: '2026-06-01' } },
    { id: 'e2', origin: { scheduleOneOffId: 'o1' } },
    { id: 'e3', origin: { libraryId: 'lib', viaTimer: true } }, // unrelated
  ];
  const keys = scheduledDoneKeys(journal);
  assert.equal(keys.has('rule:r1:2026-06-01'), true);
  assert.equal(keys.has('oneoff:o1'), true);
  assert.equal(keys.size, 2);
});

// --- CRUD --------------------------------------------------------------------

test('addRule / removeRule (drops orphaned exceptions)', () => {
  let s = { rules: [], oneOffs: [], exceptions: [] };
  s = addRule(s, weeklyRule);
  assert.equal(s.rules.length, 1);
  s = addException(s, 'r1', '2026-06-03');
  assert.equal(s.exceptions.length, 1);
  s = removeRule(s, 'r1');
  assert.equal(s.rules.length, 0);
  assert.equal(s.exceptions.length, 0); // exception cleaned up
});

test('one-off add / status / remove', () => {
  let s = { rules: [], oneOffs: [], exceptions: [] };
  s = addOneOff(s, { id: 'o1', date: '2026-06-04', libraryId: 'l', name: 'x', status: 'planned' });
  s = setOneOffStatus(s, 'o1', 'skipped');
  assert.equal(s.oneOffs[0].status, 'skipped');
  s = removeOneOff(s, 'o1');
  assert.equal(s.oneOffs.length, 0);
});

test('addException is idempotent; removeException clears it', () => {
  let s = { rules: [weeklyRule], oneOffs: [], exceptions: [] };
  s = addException(s, 'r1', '2026-06-03');
  s = addException(s, 'r1', '2026-06-03'); // dup ignored
  assert.equal(s.exceptions.length, 1);
  s = removeException(s, 'r1', '2026-06-03');
  assert.equal(s.exceptions.length, 0);
});
