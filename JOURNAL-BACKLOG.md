# Journal & Scheduling — Backlog

Design decisions and deferred work for the fitness-journal + scheduling features.
Living document; prune as items ship. See `HANDOFF.md` for the app overview.

Status legend: **shipped** · **next** · **planned** · **backlog**

---

## Build sequence (current intent)

1. ✅ Step 1 — foundation utilities (`date/catalog/exercises/storage`)
2. ✅ Step 2 — journal model + UI (log / history / tabs)
3. ✅ Step 3 — JSON backup / export-import
4. ✅ **In-Timer Logging & Exercise History** — inline on-timer logger (not a
   sheet/pause), crash-safe active draft, history hint, completion review sheet,
   resume banner, leave-timer prompt. Backfill via the full editor.
5. **planned** Scheduling / calendar
6. **planned** Polish cluster (trends, stats, PRs, library "last done", draft safety)

> In-timer note: the per-set surface is the inline logger; the **review sheet**
> survives only at completion/resume (the sheet-per-set idea was the wrong call).

> Rationale: for the primary use case (reusing timers and tracking results),
> in-timer history/logging is more central than calendar scheduling. Backup comes
> first because journal data is now valuable and this is localStorage-only.

---

## Exercise identity model (decided)

How the app tells `Front Squat` / `Back Squat` / `Squat` / `Split Squat` apart:

- Identity is **lexical**, via `normalizeExerciseName` (trim + collapse whitespace
  + lowercase). Distinct normalized names → distinct catalog entries → distinct
  `exerciseId` → distinct histories. The four squat variants are kept correctly
  separate because they are different strings.
- **No semantic inference.** The app must NOT decide that "Squat" means "Back
  Squat." Your personal catalog defines identity. This is deliberate for a
  personal tool.
- Failure modes are naming-discipline problems, not model problems:
  - *False split* — typos/plurals/abbreviations fork one lift ("Bench Press" vs
    "Bench Pres").
  - *False merge* — calling two different lifts the same name collapses them.
- **Reliability mechanisms** (the real fixes, not AI/taxonomy):
  1. **Autocomplete from your own catalog** — typing "Squa…" offers existing
     entries to pick, so you reuse the exact `exerciseId` instead of re-spelling.
     Load-bearing: the whole cross-timer-history design depends on consistent
     names. **planned** (lands with in-timer logging).
  2. **Aliases** — the `aliases: []` field already on every catalog entry (always
     empty today) maps "FS" → Front Squat or merges a typo'd duplicate into the
     canonical entry. Needs a **merge/rename UI**. **backlog**.

---

## In-Timer Logging & Exercise History (next big feature)

One coherent feature, not two. While a timer runs, show the current exercise's
history and let the user log sets as they go (optionally).

**Why new timers get this for free:** every timer slot already carries a `name`.
The flow is `slot.name → normalizeExerciseName → catalog → exerciseId →
entriesForExercise()`. The timer needs nothing but the name, so a brand-new
custom timer containing a "Squat" slot automatically surfaces full squat history.
This is exactly what the `exerciseId` indirection was added for.

**Decided design:**
- **Granularity: loose-first, slot-aware.** The timer *suggests* the current
  slot/set ("Squat — set 2 of 5", from `expandSetsFromSlots`), but the user can
  log an extra set, skip, swap an exercise, or edit on the fly. Slots are a guide,
  not gospel.
- **Default values: suggestions, not saved data.** Last-time values render as
  placeholders/ghosts. A set becomes real only when the user confirms/touches it
  or marks it done. This avoids silently copying old workouts into new history
  while keeping repeats one-tap fast. (Resolves watch-item #3 below for this mode.)

**Requirements this surfaces:**
- **Draft persistence is mandatory here.** Workouts are long, screens lock, iOS
  kills backgrounded PWAs — a live-built entry MUST survive that. Losing a
  mid-workout draft is worse than losing an unsaved form.
- Reconcile with the end-of-timer flow: keep both. If sets were logged as-you-go,
  the completion screen shows "review & save"; otherwise the prefilled editor as
  today.
- Tolerate off-script: add/remove/edit exercises and sets mid-workout.
- Partial save when stopping early (see "log anytime" below).
- Unilateral/combined slots = one logical set (already collapsed in `setCount`).
- Preset timers with generic "Exercise N" names won't match history until renamed
  — consistent with presets being low-value for logging.

**Open question:** caching behavior — show only the single most recent prior
session inline, or a small "last 3" strip? (Decide at planning.)

---

## UX audit — tiered backlog

### Tier 1 — undercuts the core value (reuse + track)
- **Per-exercise progression view.** The payoff of journaling. `entriesForExercise()`
  exists, unused. No trend/chart/"last 5". *(absorbed by in-timer logging + polish)*
- **"Last time" context while logging.** Show prior numbers at the moment you set
  today's load. *(in-timer logging / polish)*
- **Suggestion vs. record.** Prefilled values currently look identical to entered
  ones; an untouched prefill saves last week's numbers as if performed. Decided
  fix (placeholders-until-confirmed) lives in in-timer logging; the end-of-timer
  editor needs the same treatment. *(planned)*
- **"Already logged today" guard.** Running a timer twice / tapping Log result
  twice makes duplicate entries with no warning. Mirror the library Save flow's
  "Update vs Save as new". *(small, high-value)*
- **Exercise-name autocomplete.** See identity model above. *(planned, with in-timer)*

### Tier 2 — friction in the reuse loop
- **Library "last done / last weights / frequency."** Saved timers show nothing
  about their own history though `origin.libraryId` links them. Surface it.
- **Editor data-loss safety.** No "discard changes?" on Cancel; React-state draft
  lost if the PWA is killed mid-log. Draft persistence + dirty-cancel guard.
- **Faster set entry for no-history case.** "Duplicate last set" / "fill all sets
  from first" for brand-new exercises.
- **Quick-start last session** (HANDOFF idea #1) — reuse is several taps today.

### Tier 3 — smaller gaps
- Log-anytime / partial save from the timer (not only at full completion).
- PR detection ("new top set for Squat") at save time.
- Filter/search History by exercise or source timer.
- Reorder exercises/sets in the editor.
- Cardio time entry as mm:ss instead of raw `timeSec` seconds.
- Catalog merge/rename UI (cleanup path for autocomplete misses).

### Backdating nuance (watch-item #1 from B1 review)
Changing an entry's date in the editor does **not** recalculate carry-forward
(seeded once at open from the latest history). Narrow case; re-seeding would also
stomp typed values. Deferred — revisit with the editor polish.

---

## Scheduling foreshadow

`origin.scheduleRuleId` / `origin.occurrenceDate` already exist on journal entries
but are unused until scheduling ships. When it lands, History should reflect
"planned → done." Build journal/history changes aware that this is coming.

**Backup follow-ups when scheduling ships** (Step 3 left these as TODOs because
schedule has no React state yet):
- `getBackup()` currently reads schedule via `loadSchedule()` (localStorage).
  Once calendar state exists, export the **in-memory schedule state** instead.
- `onImported()` currently refreshes library/journal/catalog only. It must also
  **refresh schedule state** after a restore once that state exists.
