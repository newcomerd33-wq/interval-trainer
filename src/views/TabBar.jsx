// =============================================================================
// BOTTOM TAB BAR
// -----------------------------------------------------------------------------
// Persistent iOS-style tab bar shown only on top-level views (Train / History /
// Saved). Rendered by App; visibility + active state are decided there.
// =============================================================================

import { Timer, CalendarDays, ClipboardList, Bookmark } from 'lucide-react';

const TABS = [
  { id: 'train', label: 'Train', Icon: Timer },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'history', label: 'History', Icon: ClipboardList },
  { id: 'library', label: 'Saved', Icon: Bookmark },
];

export function TabBar({ active, onSelect }) {
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-sep)] bg-[var(--color-grouped-bg)]/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-[440px] mx-auto flex">
        {TABS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={on ? 'page' : undefined}
              className="press flex-1 h-[52px] flex flex-col items-center justify-center gap-0.5"
              style={{ color: on ? 'var(--color-accent)' : 'var(--color-secondary)' }}
            >
              <Icon size={22} strokeWidth={on ? 2.4 : 2} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
