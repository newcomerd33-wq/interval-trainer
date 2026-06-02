// =============================================================================
// TODAY STRIP
// -----------------------------------------------------------------------------
// One-tap launcher on the Train home for what's scheduled today. Shows planned
// (not done, not skipped) occurrences with Start / Log. Hidden when nothing is
// scheduled. App resolves today's occurrences and passes them in.
// =============================================================================

import { Play, ClipboardList } from 'lucide-react';

export function TodayStrip({ occurrences, library, onStart, onLog }) {
  if (!occurrences || occurrences.length === 0) return null;
  return (
    <div className="mx-4 mt-3 rounded-xl bg-[var(--color-cell)] overflow-hidden">
      <div className="px-3 pt-2.5 pb-1 text-[12px] uppercase tracking-wide text-[var(--color-secondary)]">Today</div>
      {occurrences.map((occ) => {
        const item = library.find((i) => i.id === occ.libraryId);
        return (
          <div key={occ.id} className="sep-row flex items-center gap-2 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[16px] text-white truncate">{occ.name || 'Workout'}</div>
              <div className="text-[12px] text-[var(--color-tertiary)]">
                {occ.source === 'rule' ? 'Scheduled' : 'Planned'}{!item ? ' · timer deleted' : ''}
              </div>
            </div>
            <button type="button" disabled={!item} onClick={() => onLog(occ)} aria-label={`Log ${occ.name || 'workout'}`}
              className="press w-9 h-9 rounded-lg text-[var(--color-accent)] active:bg-[var(--color-cell-pressed)] flex items-center justify-center disabled:opacity-30">
              <ClipboardList size={17} strokeWidth={2.2} />
            </button>
            <button type="button" disabled={!item} onClick={() => onStart(occ)}
              className="press h-9 px-4 rounded-lg text-[14px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-30"
              style={{ background: 'var(--color-accent)', color: '#000' }}>
              <Play size={14} strokeWidth={2.5} fill="currentColor" /> Start
            </button>
          </div>
        );
      })}
    </div>
  );
}
