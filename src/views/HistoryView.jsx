// =============================================================================
// HISTORY VIEW
// -----------------------------------------------------------------------------
// Journal entries grouped by date. Row body opens the entry for edit; the
// trailing trash button deletes (sibling buttons, no nesting). "New" creates an
// ad-hoc entry. Read-only over the journal — all mutations go through App.
// =============================================================================

import { Plus, Trash2, ClipboardList, Sliders, Repeat, Dumbbell } from 'lucide-react';
import { NavBar, Group, GroupHeader, GroupFooter } from './ui.jsx';
import { groupEntriesByDate, entrySummary } from '../journal.js';

const SOURCE_ICON = { custom: Sliders, rotation: Repeat, preset: Dumbbell, adhoc: ClipboardList };

function fmtTime(loggedAt) {
  if (!loggedAt) return '';
  try {
    return new Date(loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function summaryLine(entry) {
  const s = entrySummary(entry);
  let line = `${s.exerciseCount} exercise${s.exerciseCount === 1 ? '' : 's'} · ${s.totalSets} set${s.totalSets === 1 ? '' : 's'}`;
  if (s.headline) {
    const reps = s.headline.reps != null ? `×${s.headline.reps}` : '';
    line += ` · ${s.headline.name} ${s.headline.weight}${s.headline.unit}${reps}`;
  }
  return line;
}

export function HistoryView({ journal, onNew, onOpen, onRequestDelete }) {
  const groups = groupEntriesByDate(journal);

  return (
    <div className="slideIn pb-8">
      <NavBar title="History" rightLabel="New" rightIcon={Plus} onRight={onNew} />

      {journal.length === 0 ? (
        <div className="px-4 mt-12 text-center">
          <ClipboardList size={32} strokeWidth={2} className="mx-auto text-[var(--color-tertiary)]" />
          <div className="text-[17px] font-semibold mt-4">No workouts logged yet</div>
          <div className="text-[14px] text-[var(--color-secondary)] mt-1">
            Finish a timer and tap “Log result”, log from a saved session, or tap New to record one by hand.
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key}>
            <GroupHeader>{group.label}</GroupHeader>
            <Group>
              {group.entries.map((entry) => {
                const Icon = SOURCE_ICON[entry.sourceType] || ClipboardList;
                return (
                  <div key={entry.id} className="sep-row flex items-center min-h-[60px] pr-2">
                    <button
                      type="button"
                      onClick={() => onOpen(entry)}
                      className="press flex-1 min-w-0 text-left flex items-center px-4 py-2.5 active:bg-[var(--color-cell-pressed)] rounded-l-lg"
                    >
                      <Icon size={18} strokeWidth={2.2} className="text-[var(--color-tertiary)] mr-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[17px] text-white truncate">{entry.sessionName || 'Workout'}</div>
                        <div className="text-[13px] text-[var(--color-secondary)] mt-0.5 truncate">{summaryLine(entry)}</div>
                      </div>
                      <div className="text-[13px] text-[var(--color-tertiary)] ml-3 shrink-0 tabular">{fmtTime(entry.loggedAt)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestDelete(entry)}
                      aria-label={`Delete ${entry.sessionName || 'entry'}`}
                      className="press w-10 h-10 rounded-full text-red-400 active:bg-red-500/10 flex items-center justify-center shrink-0 ml-1"
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                );
              })}
            </Group>
          </div>
        ))
      )}

      {journal.length > 0 && <GroupFooter>Tap an entry to edit it. Trash icon deletes.</GroupFooter>}
    </div>
  );
}
