// =============================================================================
// LOG EDITOR VIEW
// -----------------------------------------------------------------------------
// Create/edit a journal entry. Holds its own working copy of the draft and calls
// onSave(entry) once. Numeric fields are edited as strings (so decimals/partials
// type cleanly) and serialized to number|null on save. Catalog resolution +
// blank-name dropping happen in App.saveLog — this view stays presentational.
// =============================================================================

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { NavBar, Group, GroupHeader, GroupFooter } from './ui.jsx';
import { emptyExercise, emptySet, fieldsForMetric, SET_NUMERIC_FIELDS } from '../journal.js';
import { METRIC_KINDS } from '../catalog.js';

const KIND_LABEL = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  time: 'Time',
  distance_time: 'Distance + time',
  freeform: 'Freeform',
};

const FIELD = {
  weight: { label: 'Weight', ph: 'wt' },
  reps: { label: 'Reps', ph: 'reps' },
  rpe: { label: 'RPE', ph: 'rpe' },
  timeSec: { label: 'Time (s)', ph: 'sec' },
  distance: { label: 'Distance', ph: 'dist' },
  value: { label: 'Value', ph: 'value' },
};

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function serialize(entry) {
  return {
    ...entry,
    sessionName: (entry.sessionName || '').trim(),
    sessionRPE: numOrNull(entry.sessionRPE),
    bodyweight: numOrNull(entry.bodyweight),
    exercises: (entry.exercises || []).map((ex) => ({
      ...ex,
      nameSnapshot: (ex.nameSnapshot || '').trim(),
      note: ex.note || '',
      sets: (ex.sets || []).map((s) => {
        const o = { ...s };
        for (const f of SET_NUMERIC_FIELDS) o[f] = numOrNull(s[f]);
        return o;
      }),
    })),
  };
}

// value coercion for a controlled numeric input (keeps the raw string in state)
function inputVal(v) {
  return v == null ? '' : v;
}

export function LogEditorView({ draft, mode, suggestions = {}, onSave, onCancel }) {
  const [entry, setEntry] = useState(draft);
  const [showDetails, setShowDetails] = useState(false);

  const patch = (p) => setEntry((e) => ({ ...e, ...p }));

  const updateExercise = (idx, fn) =>
    setEntry((e) => ({ ...e, exercises: e.exercises.map((ex, i) => (i === idx ? fn(ex) : ex)) }));

  const removeExercise = (idx) =>
    setEntry((e) => ({ ...e, exercises: e.exercises.filter((_, i) => i !== idx) }));

  const addExercise = () =>
    setEntry((e) => ({ ...e, exercises: [...e.exercises, emptyExercise({ name: '', setCount: 1 })] }));

  const addSet = (idx) =>
    updateExercise(idx, (ex) => ({ ...ex, sets: [...ex.sets, emptySet(ex.metricKind)] }));

  const removeSet = (exIdx, setIdx) =>
    updateExercise(exIdx, (ex) => ({ ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) }));

  const updateSet = (exIdx, setIdx, p) =>
    updateExercise(exIdx, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, ...p } : s)),
    }));

  // Tapping the check on an empty set fills it from the suggestion and marks it
  // done (one-tap "same as last time"); otherwise it just toggles done.
  const confirmSet = (exIdx, setIdx) =>
    updateExercise(exIdx, (ex) => {
      const s = ex.sets[setIdx];
      const sugg = suggestions[ex.exerciseId]?.[setIdx];
      const empty = SET_NUMERIC_FIELDS.every((f) => s[f] == null || s[f] === '');
      let ns;
      if (!s.done && empty && sugg) {
        ns = { ...s, done: true };
        for (const f of fieldsForMetric(ex.metricKind)) if (sugg[f] != null) ns[f] = sugg[f];
      } else {
        ns = { ...s, done: !s.done };
      }
      return { ...ex, sets: ex.sets.map((x, i) => (i === setIdx ? ns : x)) };
    });

  // Switching metric kind keeps rows; carries fields valid in both kinds.
  const changeMetric = (idx, kind) =>
    updateExercise(idx, (ex) => {
      const keep = fieldsForMetric(kind).filter((f) => fieldsForMetric(ex.metricKind).includes(f));
      const sets = ex.sets.map((s) => {
        const ns = emptySet(kind);
        ns.id = s.id;
        ns.done = s.done;
        for (const f of keep) ns[f] = s[f];
        return ns;
      });
      return { ...ex, metricKind: kind, sets };
    });

  const save = () => onSave(serialize(entry));

  const title = mode === 'edit' ? 'Edit entry' : 'Log workout';

  return (
    <div className="slideIn pb-8">
      <NavBar title={title} leftLabel="Cancel" onLeft={onCancel} rightLabel="Save" onRight={save} />

      {/* date + name */}
      <Group className="mt-3">
        <label className="sep-row flex items-center justify-between px-4 py-2.5">
          <span className="text-[15px] text-[var(--color-secondary)]">Date</span>
          <input
            type="date"
            value={entry.date}
            onChange={(e) => patch({ date: e.target.value })}
            className="bg-transparent text-[17px] text-white text-right focus:outline-none"
          />
        </label>
        <div className="px-4 py-2.5">
          <input
            type="text"
            value={entry.sessionName}
            onChange={(e) => patch({ sessionName: e.target.value })}
            onFocus={(e) => e.target.select()}
            placeholder="Session name"
            className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
          />
        </div>
      </Group>

      {/* exercises */}
      {entry.exercises.length === 0 ? (
        <div className="px-4 mt-8 text-center text-[14px] text-[var(--color-secondary)]">
          No exercises yet. Add one to start logging sets.
        </div>
      ) : (
        entry.exercises.map((ex, exIdx) => {
          const fields = fieldsForMetric(ex.metricKind);
          return (
            <div key={ex.id}>
              <Group className="mt-4">
                {/* header: name + remove */}
                <div className="sep-row flex items-center gap-2 px-4 py-2.5">
                  <input
                    type="text"
                    value={ex.nameSnapshot}
                    onChange={(e) => updateExercise(exIdx, (x) => ({ ...x, nameSnapshot: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Exercise name"
                    className="flex-1 min-w-0 bg-transparent text-[17px] font-semibold text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeExercise(exIdx)}
                    aria-label="Remove exercise"
                    className="press w-8 h-8 rounded-full text-red-400 active:bg-red-500/10 flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>

                {/* metric kind + unit */}
                <div className="sep-row flex items-center justify-between gap-2 px-4 py-2">
                  <select
                    value={ex.metricKind}
                    onChange={(e) => changeMetric(exIdx, e.target.value)}
                    className="bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[14px] text-white focus:outline-none"
                  >
                    {METRIC_KINDS.map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  {ex.metricKind === 'weight_reps' && (
                    <div className="inline-flex rounded-lg bg-[var(--color-cell-pressed)] p-0.5">
                      {['lb', 'kg'].map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => updateExercise(exIdx, (x) => ({ ...x, unit: u }))}
                          className="press px-3 py-1 rounded-md text-[13px] font-medium"
                          style={{ background: ex.unit === u ? 'var(--color-accent)' : 'transparent', color: ex.unit === u ? '#000' : 'var(--color-secondary)' }}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* sets */}
                {ex.sets.map((s, setIdx) => {
                  const sugg = suggestions[ex.exerciseId]?.[setIdx];
                  return (
                  <div key={s.id} className="sep-row flex items-center gap-2 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => confirmSet(exIdx, setIdx)}
                      aria-label="Confirm set"
                      className="press w-7 h-7 rounded-full flex items-center justify-center shrink-0 border"
                      style={{
                        background: s.done ? 'var(--color-accent)' : 'transparent',
                        borderColor: s.done ? 'var(--color-accent)' : 'var(--color-sep)',
                      }}
                    >
                      {s.done && <Check size={15} strokeWidth={3} className="text-black" />}
                    </button>
                    <div className="text-[13px] text-[var(--color-tertiary)] w-5 shrink-0 tabular">{setIdx + 1}</div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      {fields.map((f) => (
                        <input
                          key={f}
                          type="text"
                          inputMode="decimal"
                          value={inputVal(s[f])}
                          onChange={(e) => updateSet(exIdx, setIdx, { [f]: e.target.value })}
                          onFocus={(e) => e.target.select()}
                          placeholder={sugg?.[f] != null ? String(sugg[f]) : FIELD[f].ph}
                          className="min-w-0 flex-1 bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[15px] text-white text-center tabular placeholder:text-[var(--color-tertiary)] focus:outline-none"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSet(exIdx, setIdx)}
                      aria-label="Remove set"
                      className="press w-7 h-7 rounded-full text-[var(--color-tertiary)] active:bg-[var(--color-cell-pressed)] flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                  );
                })}

                {/* per-exercise note + add set */}
                <div className="px-4 py-2">
                  <input
                    type="text"
                    value={ex.note}
                    onChange={(e) => updateExercise(exIdx, (x) => ({ ...x, note: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Note (optional)"
                    className="w-full bg-transparent text-[14px] text-[var(--color-secondary)] placeholder:text-[var(--color-tertiary)] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addSet(exIdx)}
                  className="press w-full flex items-center justify-center gap-1.5 h-11 text-[15px] text-[var(--color-accent)] border-t border-[var(--color-sep)]"
                >
                  <Plus size={16} strokeWidth={2.5} /> Add set
                </button>
              </Group>
            </div>
          );
        })
      )}

      <div className="px-4 mt-4">
        <button
          type="button"
          onClick={addExercise}
          className="press w-full h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={2.5} /> Add exercise
        </button>
      </div>

      {/* collapsed session details */}
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="press w-full flex items-center justify-between px-4 mt-6 mb-1.5 text-[13px] uppercase tracking-wide text-[var(--color-secondary)]"
      >
        <span>Session details</span>
        {showDetails ? <ChevronUp size={16} strokeWidth={2.2} /> : <ChevronDown size={16} strokeWidth={2.2} />}
      </button>
      {showDetails && (
        <Group>
          <label className="sep-row flex items-center justify-between px-4 py-2.5">
            <span className="text-[15px] text-[var(--color-secondary)]">Session RPE</span>
            <input
              type="text"
              inputMode="decimal"
              value={inputVal(entry.sessionRPE)}
              onChange={(e) => patch({ sessionRPE: e.target.value })}
              onFocus={(e) => e.target.select()}
              placeholder="1–10"
              className="w-24 bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[15px] text-white text-center tabular placeholder:text-[var(--color-tertiary)] focus:outline-none"
            />
          </label>
          <div className="sep-row flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-[15px] text-[var(--color-secondary)]">Bodyweight</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={inputVal(entry.bodyweight)}
                onChange={(e) => patch({ bodyweight: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="—"
                className="w-24 bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[15px] text-white text-center tabular placeholder:text-[var(--color-tertiary)] focus:outline-none"
              />
              <div className="inline-flex rounded-lg bg-[var(--color-cell-pressed)] p-0.5">
                {['lb', 'kg'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => patch({ bodyweightUnit: u })}
                    className="press px-2.5 py-1 rounded-md text-[13px] font-medium"
                    style={{ background: entry.bodyweightUnit === u ? 'var(--color-accent)' : 'transparent', color: entry.bodyweightUnit === u ? '#000' : 'var(--color-secondary)' }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5">
            <textarea
              value={entry.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Session notes"
              rows={2}
              className="w-full bg-transparent text-[15px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none resize-none"
            />
          </div>
        </Group>
      )}

      <GroupFooter>
        {mode === 'edit' ? 'Changes are saved when you tap Save.' : 'Tick sets as you complete them. Tap Save to record this workout.'}
      </GroupFooter>
    </div>
  );
}
