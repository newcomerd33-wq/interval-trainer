// =============================================================================
// REVIEW LOG SHEET
// -----------------------------------------------------------------------------
// The workout wrap-up: a quick summary of what was logged inline, an editable
// session-notes field, and three actions. Intentionally NOT a second editor —
// value/set edits and backfill route to the full LogEditorView via Open editor,
// so there's one place that owns set-editing controls.
//
//   onSave        -> finalize the draft to history (shared commit path)
//   onOpenEditor  -> open the full editor on the draft
//   onDiscard     -> discard the draft
//   onNotesChange -> live-update the draft's session notes
// =============================================================================

import { Sheet } from './ui.jsx';
import { isLoggedSet, formatSetGroups } from '../journal.js';

export function ReviewLog({ open, draft, onClose, onSave, onOpenEditor, onDiscard, onNotesChange }) {
  if (!draft) return null;
  const logged = (draft.exercises || [])
    .map((ex) => ({ ex, sets: (ex.sets || []).filter(isLoggedSet) }))
    .filter((x) => x.sets.length > 0);
  const totalSets = logged.reduce((n, x) => n + x.sets.length, 0);

  return (
    <Sheet open={open} onClose={onClose} title="Workout complete" primaryLabel="Save" onPrimary={onSave}>
      <div className="px-4 text-[13px] text-[var(--color-secondary)]">
        {logged.length} exercise{logged.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'} logged
      </div>

      {logged.length > 0 ? (
        <div className="mt-2 mx-4 rounded-xl bg-[var(--color-cell)] overflow-hidden">
          {logged.map(({ ex, sets }) => (
            <div key={ex.id} className="sep-row px-4 py-2.5">
              <div className="text-[15px] text-white">{ex.nameSnapshot || 'Exercise'}</div>
              <div className="text-[13px] text-[var(--color-secondary)] mt-0.5 tabular">
                {formatSetGroups(sets, ex.metricKind)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 mt-3 text-[14px] text-[var(--color-secondary)]">
          No sets logged. Open the editor to add them, or discard.
        </div>
      )}

      <div className="px-4 mt-3">
        <textarea
          value={draft.notes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Session notes"
          rows={2}
          className="w-full bg-[var(--color-cell)] rounded-xl px-3 py-2.5 text-[15px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none resize-none"
        />
      </div>

      <div className="px-4 mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenEditor} className="press h-11 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium">
          Open full editor
        </button>
        <button type="button" onClick={onDiscard} className="press h-11 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium text-red-400">
          Discard
        </button>
      </div>
    </Sheet>
  );
}
