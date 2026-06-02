// =============================================================================
// CALENDAR VIEW
// -----------------------------------------------------------------------------
// Tappable month grid of scheduled workouts. Dots: accent = planned, green =
// done (done is journal-derived via scheduledDoneKeys). Tapping a day opens the
// DaySheet for detail + actions. Read-only over schedule/journal; all mutations
// go through App handlers passed in.
// =============================================================================

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, startOfWeek, addDays, daysInMonth, todayKey } from '../date.js';
import { occurrencesInRange, scheduledDoneKeys } from '../schedule.js';
import { DaySheet } from './DaySheet.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
const monthOf = (key) => key.slice(0, 7);

export function CalendarView({ schedule, journal, library, handlers }) {
  const today = todayKey();
  const [monthKey, setMonthKey] = useState(startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(null);

  const monthStart = startOfMonth(monthKey);
  const gridStart = startOfWeek(monthStart, 0); // Sunday
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const gridEnd = cells[41];

  const doneKeys = scheduledDoneKeys(journal);
  const byDate = {};
  for (const occ of occurrencesInRange(schedule, gridStart, gridEnd)) {
    (byDate[occ.date] ||= []).push(occ);
  }

  const dayState = (dateKey) => {
    const occs = byDate[dateKey] || [];
    let done = false, planned = false;
    for (const o of occs) {
      if (doneKeys.has(o.id)) done = true;
      else if (o.status !== 'skipped') planned = true;
    }
    return { count: occs.length, done, planned };
  };

  const prevMonth = () => setMonthKey(startOfMonth(addDays(monthStart, -1)));
  const nextMonth = () => setMonthKey(startOfMonth(addDays(monthStart, daysInMonth(monthStart))));
  const goToday = () => setMonthKey(startOfMonth(today));

  return (
    <div className="slideIn pb-8">
      <div className="h-11 flex items-center px-4">
        <button type="button" onClick={prevMonth} aria-label="Previous month" className="press w-9 h-9 -ml-1 flex items-center justify-center text-[var(--color-accent)]">
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <div className="flex-1 text-center text-[17px] font-semibold">{monthLabel(monthKey)}</div>
        <button type="button" onClick={nextMonth} aria-label="Next month" className="press w-9 h-9 -mr-1 flex items-center justify-center text-[var(--color-accent)]">
          <ChevronRight size={22} strokeWidth={2.2} />
        </button>
      </div>

      <div className="px-2">
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-medium text-[var(--color-tertiary)] py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((dateKey) => {
            const inMonth = monthOf(dateKey) === monthKey;
            const isToday = dateKey === today;
            const st = dayState(dateKey);
            const dayNum = Number(dateKey.slice(8, 10));
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                className="press relative h-12 flex flex-col items-center justify-center rounded-lg active:bg-[var(--color-cell-pressed)]"
              >
                <span
                  className={`text-[15px] tabular ${isToday ? 'w-7 h-7 rounded-full flex items-center justify-center font-semibold' : ''} ${inMonth ? 'text-white' : 'text-[var(--color-tertiary)]'}`}
                  style={isToday ? { background: 'var(--color-accent)', color: '#000' } : undefined}
                >
                  {dayNum}
                </span>
                {st.count > 0 && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {st.planned && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
                    {st.done && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(94, 234, 160)' }} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-3 flex justify-center">
        <button type="button" onClick={goToday} className="press text-[14px] text-[var(--color-accent)] font-medium px-3 py-1">Today</button>
      </div>

      <DaySheet
        open={!!selectedDate}
        date={selectedDate}
        occurrences={selectedDate ? byDate[selectedDate] || [] : []}
        doneKeys={doneKeys}
        library={library}
        onClose={() => setSelectedDate(null)}
        handlers={handlers}
      />
    </div>
  );
}
