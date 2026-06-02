// =============================================================================
// DAY SHEET
// -----------------------------------------------------------------------------
// Bottom sheet for one calendar day: lists that day's occurrences with actions
// (Start / Log / Skip / Remove), and an add flow (pick a saved timer -> this day
// only, or repeat weekly on this weekday). Controlled by App via `handlers`.
// =============================================================================

import { useState, useEffect } from 'react';
import { Play, ClipboardList, Plus, ChevronLeft } from 'lucide-react';
import { Sheet } from './ui.jsx';
import { fromDateKey, dayOfWeek } from '../date.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function prettyDate(dateKey) {
  if (!dateKey) return '';
  const d = fromDateKey(dateKey);
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function DaySheet({ open, date, occurrences, doneKeys, library, onClose, handlers }) {
  const [mode, setMode] = useState('list'); // 'list' | 'pick' | 'repeat'
  const [picked, setPicked] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  // reset to list each time the sheet opens on a new day
  useEffect(() => { if (open) { setMode('list'); setPicked(null); setConfirmRemoveId(null); } }, [open, date]);

  if (!open) return null;
  const itemById = (id) => library.find((i) => i.id === id) || null;
  const weekday = date ? dayOfWeek(date) : 0;

  const addOneOff = (item) => { handlers.onAddOneOff(date, item); setMode('list'); setPicked(null); };
  const addWeekly = (item) => { handlers.onAddWeekly(item, [weekday], date); setMode('list'); setPicked(null); };

  return (
    <Sheet open={open} onClose={onClose} title={prettyDate(date)} primaryLabel="Done" onPrimary={onClose}>
      {mode === 'list' && (
        <>
          {occurrences.length === 0 ? (
            <div className="px-4 py-4 text-center text-[14px] text-[var(--color-secondary)]">Nothing scheduled.</div>
          ) : (
            <div className="px-4 space-y-2">
              {occurrences.map((occ) => {
                const done = doneKeys.has(occ.id);
                const item = itemById(occ.libraryId);
                const skipped = occ.status === 'skipped';
                return (
                  <div key={occ.id} className="rounded-xl bg-[var(--color-cell)] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] text-white truncate">{occ.name || 'Workout'}</div>
                        <div className="text-[12px] text-[var(--color-tertiary)]">
                          {occ.source === 'rule' ? 'Repeats weekly' : 'One-off'}
                          {done ? ' · Done' : skipped ? ' · Skipped' : ''}
                          {!item ? ' · timer deleted' : ''}
                        </div>
                      </div>
                      {done && <span className="text-[13px] font-semibold" style={{ color: 'rgb(94, 234, 160)' }}>✓</span>}
                    </div>
                    {!done && !skipped && (
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" disabled={!item} onClick={() => handlers.onStart(occ)}
                          className="press flex-1 h-9 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-30"
                          style={{ background: 'var(--color-accent)', color: '#000' }}>
                          <Play size={14} strokeWidth={2.5} fill="currentColor" /> Start
                        </button>
                        <button type="button" disabled={!item} onClick={() => handlers.onLog(occ)}
                          className="press flex-1 h-9 rounded-lg bg-[var(--color-cell-pressed)] text-[14px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-30">
                          <ClipboardList size={14} strokeWidth={2.5} /> Log
                        </button>
                      </div>
                    )}
                    {confirmRemoveId === occ.id ? (
                      <div className="mt-2 flex items-center gap-3 text-[13px]">
                        <span className="text-[var(--color-secondary)] flex-1">Remove the whole weekly series?</span>
                        <button type="button" onClick={() => setConfirmRemoveId(null)} className="press text-[var(--color-accent)]">Cancel</button>
                        <button type="button" onClick={() => { handlers.onRemove(occ); setConfirmRemoveId(null); }} className="press text-red-400 font-semibold">Remove</button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-4 text-[13px]">
                        {!done && !skipped && (
                          <button type="button" onClick={() => handlers.onSkip(occ)} className="press text-[var(--color-secondary)]">Skip this day</button>
                        )}
                        <button type="button" onClick={() => (occ.source === 'rule' ? setConfirmRemoveId(occ.id) : handlers.onRemove(occ))} className="press text-red-400">
                          {occ.source === 'rule' ? 'Remove series' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-4 mt-3">
            <button type="button" onClick={() => setMode('pick')}
              className="press w-full h-11 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2">
              <Plus size={16} strokeWidth={2.5} /> Add workout
            </button>
          </div>
        </>
      )}

      {mode === 'pick' && (
        <>
          <div className="px-4 -mt-1 mb-1">
            <button type="button" onClick={() => setMode('list')} className="press inline-flex items-center text-[14px] text-[var(--color-accent)]">
              <ChevronLeft size={18} strokeWidth={2.2} /> Back
            </button>
          </div>
          {library.length === 0 ? (
            <div className="px-4 py-4 text-center text-[14px] text-[var(--color-secondary)]">Save a timer first, then schedule it here.</div>
          ) : (
            <div className="px-4 space-y-1.5 max-h-[40vh] overflow-y-auto">
              {library.map((item) => (
                <button key={item.id} type="button" onClick={() => { setPicked(item); setMode('repeat'); }}
                  className="press w-full text-left rounded-xl bg-[var(--color-cell)] px-3 py-2.5">
                  <div className="text-[16px] text-white truncate">{item.name}</div>
                  <div className="text-[12px] text-[var(--color-tertiary)] capitalize">{item.sourceType}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'repeat' && picked && (
        <div className="px-4">
          <div className="text-[15px] text-white text-center mb-3">
            Add <span className="font-semibold">{picked.name}</span>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={() => addOneOff(picked)}
              className="press w-full h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium">
              Just this day
            </button>
            <button type="button" onClick={() => addWeekly(picked)}
              className="press w-full h-12 rounded-2xl text-[15px] font-semibold"
              style={{ background: 'var(--color-accent)', color: '#000' }}>
              Every {WEEKDAYS[weekday]}
            </button>
          </div>
          <button type="button" onClick={() => setMode('pick')} className="press w-full mt-2 h-10 text-[14px] text-[var(--color-secondary)]">Back</button>
        </div>
      )}
    </Sheet>
  );
}
