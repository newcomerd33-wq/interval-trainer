// =============================================================================
// EXERCISE DERIVATION
// -----------------------------------------------------------------------------
// Turns saved library payloads (and built sessions) into a normalized list of
// exercises the journal can pre-fill a log from. Payload-driven — never parses
// rendered UI text. Two entry points:
//
//   exercisesForItem(item)      -> distinct exercises from a saved library item,
//                                  read straight from the stored payload.
//   expandSetsFromSlots(slots)  -> exercises + expected set counts from a built
//                                  session's flat `slots` array (the timer path).
//
// Both return the same normalized shape so the log editor consumes one format:
//   { name, mode, setCount }
//     mode    : 'standard' | 'unilateral' | 'alternating'
//     setCount: how many working sets to seed in the log editor
//
// Exercises are grouped by NORMALIZED name (so "Squat", "squat", "SQUAT " are
// one row, matching how the catalog dedupes), keeping the first display name
// seen. Blank names are skipped. When the same name shows up with mixed modes,
// the richer mode wins: unilateral > alternating > standard.
// =============================================================================

import { normalizeExerciseName } from './catalog.js';

const MODE_RANK = { standard: 1, alternating: 2, unilateral: 3 };
function richerMode(a, b) {
  return (MODE_RANK[b] || 0) > (MODE_RANK[a] || 0) ? b : a;
}

// Ordered group keyed by normalized name; preserves first-seen display name.
function createGroup() {
  const order = [];
  const byKey = new Map();
  return {
    add(name, mode, sets) {
      const key = normalizeExerciseName(name);
      if (!key) return; // skip empty / whitespace-only names
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: String(name).trim(), mode, setCount: 0 };
        byKey.set(key, entry);
        order.push(entry);
      } else {
        entry.mode = richerMode(entry.mode, mode);
      }
      entry.setCount += sets;
    },
    result() {
      return order;
    },
  };
}

// Slots flagged isRest are recovery, never logged.
function isWorkingSlot(slot) {
  return slot && !slot.isRest;
}

// A "set" = one working bout. A uniform-unilateral exercise emits two slots per
// round (L then R); those count as ONE loggable set, so we skip the right-side
// half when counting. Everything else (bilateral, alternating, combined,
// standard) is one set per slot.
function countsAsSet(slot) {
  return slot.side !== 'R';
}

function modeForSlot(slot) {
  if (slot.alternating) return 'alternating';
  if (slot.unilateral || slot.combined || slot.side) return 'unilateral';
  return 'standard';
}

// Build session slots (preset/custom/rotation) -> ordered distinct exercises
// with expected set counts. Preserves first-seen order.
export function expandSetsFromSlots(slots) {
  const g = createGroup();
  for (const slot of slots || []) {
    if (!isWorkingSlot(slot)) continue;
    g.add(slot.name, modeForSlot(slot), countsAsSet(slot) ? 1 : 0);
  }
  return g.result();
}

// Saved library item -> ordered distinct exercises. Reads the stored payload
// directly (no session build, no config lookup), so it works without the
// 300-config preset table. setCount here is a best-effort seed; the editor lets
// the user add/remove sets freely.
export function exercisesForItem(item) {
  if (!item) return [];

  if (item.sourceType === 'custom' && item.custom) {
    const g = createGroup();
    for (const circuit of item.custom.circuits || []) {
      const rounds = circuit.rounds || 1; // each round through the circuit is one set
      for (const ex of circuit.exercises || []) {
        g.add(ex.name, ex.mode === 'unilateral' ? 'unilateral' : 'standard', rounds);
      }
    }
    return g.result();
  }

  if (item.sourceType === 'rotation' && item.rotation) {
    const r = item.rotation;
    const accN = (r.accessories || []).length;
    const g = createGroup();
    // primary appears once per accessory per round
    if (r.primary) g.add(r.primary.name, r.primary.mode, r.rounds * accN);
    (r.accessories || []).forEach((acc) => g.add(acc.name, acc.mode, r.rounds));
    return g.result();
  }

  if (item.sourceType === 'preset' && Array.isArray(item.blocks)) {
    // One block = one exercise. We don't know `sets` without the config table,
    // so seed a single set and let the editor expand. U blocks are unilateral.
    const g = createGroup();
    for (const b of item.blocks) {
      g.add(b.name, b.type === 'U' ? 'unilateral' : b.type === 'A' ? 'alternating' : 'standard', 1);
    }
    return g.result();
  }

  return [];
}
