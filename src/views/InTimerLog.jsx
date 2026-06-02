// =============================================================================
// IN-TIMER LOG SHEET
// -----------------------------------------------------------------------------
// Bottom sheet for logging sets mid-workout. Controlled: reads the active draft,
// emits the next draft via onChange (App persists immediately = crash-safe).
// Opens on a snapshotted target exercise/set; loose — you can switch exercises,
// add sets, or log out of order. Last-time values are placeholders, not values;
// a one-tap confirm fills from the suggestion and marks the set done.
// =============================================================================

import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Sheet } from './ui.jsx';
import { emptySet, fieldsForMetric, SET_NUMERIC_FIELDS } from '../journal.js';
import { normalizeExerciseName } from '../catalog.js';

const FIELD_PH = { weight: 'wt', reps: 'reps', rpe: 'rpe', timeSec: 'sec', distance: 'dist', value: 'value' };

const inputVal = (v) => (v == null ? '' : v);

function formatSet(set, fields) {
  if (fields.includes('weight')) return `${set.weight ?? '–'}×${set.reps ?? '–'}`;
  if (fields.includes('distance')) return `${set.distance ?? '–'}/${set.timeSec ?? '–'}s`;
  if (fields.includes('timeSec')) return `${set.timeSec ?? '–'}s`;
  if (fields.includes('reps')) return `${set.reps ?? '–'}`;
  return `${set.value ?? '–'}`;
}

export function InTimerLog({ open, onClose, draft, target, exerciseHistory = {}, onChange, onReviewSave }) {
  const exercises = draft?.exercises || [];
  const [selIdx, setSelIdx] = useState(Math.min(target?.exIdx ?? 0, Math.max(0, exercises.length - 1)));

  if (!draft) return null;
  const ex = exercises[selIdx];
  const hist = ex ? exerciseHistory[normalizeExerciseName(ex.nameSnapshot)] : null;
  const suggestions = hist?.suggestions || [];
  const fields = ex ? fieldsForMetric(ex.metricKind) : [];

  const setExercises = (next) => onChange({ ...draft, exercises: next });
  const updateExercise = (i, fn) => setExercises(exercises.map((e, idx) => (idx === i ? fn(e) : e)));
  const updateSet = (i, si, p) => updateExercise(i, (e) => ({ ...e, sets: e.sets.map((s, k) => (k === si ? { ...s, ...p } : s)) }));
  const addSet = (i) => updateExercise(i, (e) => ({ ...e, sets: [...e.sets, emptySet(e.metricKind)] }));
  const removeSet = (i, si) => updateExercise(i, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== si) }));

  const confirmSet = (i, si) =>
    updateExercise(i, (e) => {
      const s = e.sets[si];
      const sugg = suggestions[si];
      const empty = SET_NUMERIC_FIELDS.every((f) => s[f] == null || s[f] === '');
      let ns;
      if (!s.done && empty && sugg) {
        ns = { ...s, done: true };
        for (const f of fieldsForMetric(e.metricKind)) if (sugg[f] != null) ns[f] = sugg[f];
      } else {
        ns = { ...s, done: !s.done };
      }
      return { ...e, sets: e.sets.map((x, k) => (k === si ? ns : x)) };
    });

  return (
    <Sheet open={open} onClose={onClose} title="Log set" primaryLabel="Done" onPrimary={onClose}>
      {exercises.length === 0 ? (
        <div className="px-4 py-6 text-center text-[14px] text-[var(--color-secondary)]">No exercises in this workout.</div>
      ) : (
        <>
          {/* exercise switcher */}
          {exercises.length > 1 && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
              {exercises.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelIdx(i)}
                  className="press shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium"
                  style={{
                    background: i === selIdx ? 'var(--color-accent)' : 'var(--color-cell)',
                    color: i === selIdx ? '#000' : 'var(--color-secondary)',
                  }}
                >
                  {e.nameSnapshot || `Exercise ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* history strip */}
          <div className="px-4">
            <div className="text-[17px] font-semibold">{ex.nameSnapshot || 'Exercise'}</div>
            {hist?.recent?.length > 0 ? (
              <div className="text-[12px] text-[var(--color-tertiary)] mt-0.5 truncate">
                Last: {hist.recent[0].sets.map((s) => formatSet(s, fields)).join(' · ')}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--color-tertiary)] mt-0.5">No history yet</div>
            )}
          </div>

          {/* sets */}
          <div className="mt-2">
            {ex.sets.map((s, si) => {
              const sugg = suggestions[si];
              return (
                <div key={s.id} className="flex items-center gap-2 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => confirmSet(selIdx, si)}
                    aria-label="Confirm set"
                    className="press w-7 h-7 rounded-full flex items-center justify-center shrink-0 border"
                    style={{ background: s.done ? 'var(--color-accent)' : 'transparent', borderColor: s.done ? 'var(--color-accent)' : 'var(--color-sep)' }}
                  >
                    {s.done && <Check size={15} strokeWidth={3} className="text-black" />}
                  </button>
                  <div className="text-[13px] text-[var(--color-tertiary)] w-5 shrink-0 tabular">{si + 1}</div>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    {fields.map((f) => (
                      <input
                        key={f}
                        type="text"
                        inputMode="decimal"
                        value={inputVal(s[f])}
                        onChange={(e) => updateSet(selIdx, si, { [f]: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        placeholder={sugg?.[f] != null ? String(sugg[f]) : FIELD_PH[f]}
                        className="min-w-0 flex-1 bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[15px] text-white text-center tabular placeholder:text-[var(--color-tertiary)] focus:outline-none"
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSet(selIdx, si)}
                    aria-label="Remove set"
                    className="press w-7 h-7 rounded-full text-[var(--color-tertiary)] active:bg-[var(--color-cell-pressed)] flex items-center justify-center shrink-0"
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-4 mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => addSet(selIdx)}
              className="press flex-1 h-11 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-1.5"
            >
              <Plus size={16} strokeWidth={2.5} /> Add set
            </button>
            <button
              type="button"
              onClick={onReviewSave}
              className="press flex-1 h-11 rounded-2xl text-[15px] font-semibold inline-flex items-center justify-center"
              style={{ background: 'var(--color-accent)', color: '#000' }}
            >
              Review &amp; save
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
