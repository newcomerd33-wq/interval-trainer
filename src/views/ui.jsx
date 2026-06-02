// =============================================================================
// SHARED UI PRIMITIVES
// -----------------------------------------------------------------------------
// Presentational building blocks shared across views. Extracted verbatim from
// App.jsx (Step 2, Commit B0) with NO behavior change — same markup, same
// classes, same props. Global CSS tokens (--color-*, .press, .sep-row, .fadeIn,
// .slideIn, .tabular) live in index.css and need no import.
// =============================================================================

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

export function NavBar({ title, leftLabel, onLeft, rightLabel, onRight, rightDisabled, rightIcon: RightIcon }) {
  return (
    <div className="h-11 flex items-center px-4 relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {onLeft && (
          <button type="button" onClick={onLeft} className="press inline-flex items-center text-[17px] text-[var(--color-accent)] h-11 -my-2 pl-1 pr-2">
            <ChevronLeft size={22} strokeWidth={2.2} className="-ml-1" />
            <span>{leftLabel || 'Back'}</span>
          </button>
        )}
      </div>
      <div className="flex-1 text-center text-[17px] font-semibold truncate">{title}</div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {onRight && (
          <button type="button" onClick={onRight} disabled={rightDisabled} className="press inline-flex items-center gap-1 text-[17px] text-[var(--color-accent)] disabled:opacity-30 px-1 h-11 -my-2">
            {RightIcon && <RightIcon size={18} strokeWidth={2.2} />}
            {rightLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function GroupHeader({ children }) {
  return <div className="px-4 mt-6 mb-1.5 text-[13px] uppercase tracking-wide text-[var(--color-secondary)]">{children}</div>;
}
export function GroupFooter({ children }) {
  return <div className="px-4 mt-1.5 text-[13px] text-[var(--color-secondary)] leading-snug">{children}</div>;
}
export function Group({ children, className = '' }) {
  return <div className={`mx-4 rounded-xl bg-[var(--color-cell)] overflow-hidden ${className}`}>{children}</div>;
}

export function Row({ children, onClick, selected, disabled, trailing, subtitle, leading, danger, className = '' }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`sep-row press w-full text-left flex items-center min-h-[44px] px-4 py-2.5 ${disabled ? 'opacity-40' : 'active:bg-[var(--color-cell-pressed)]'} ${className}`}>
      {leading && <div className="mr-3 shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className={`text-[17px] ${danger ? 'text-red-400' : 'text-white'}`}>{children}</div>
        {subtitle && <div className="text-[13px] text-[var(--color-secondary)] mt-0.5">{subtitle}</div>}
      </div>
      <div className="ml-3 flex items-center gap-1 text-[var(--color-tertiary)] shrink-0">
        {trailing}
        {selected && <Check size={18} strokeWidth={2.5} className="text-[var(--color-accent)]" />}
        {onClick && !selected && !trailing && <ChevronRight size={16} strokeWidth={2} />}
      </div>
    </button>
  );
}

export function useKeyboardOffset(active) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) { setOffset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const k = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(Math.max(0, k));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return offset;
}

export function Sheet({ open, onClose, title, children, primaryLabel = 'Done', onPrimary }) {
  const kb = useKeyboardOffset(open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 fadeIn" />
      <div
        className="relative w-full max-w-[440px] mx-auto bg-[var(--color-grouped-bg)] rounded-t-2xl pb-[max(env(safe-area-inset-bottom),16px)] slideIn"
        style={{ transform: kb > 0 ? `translateY(-${kb}px)` : undefined, transition: 'transform 0.18s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-11 flex items-center px-4 border-b border-[var(--color-sep)]">
          <button type="button" onClick={onClose} className="press text-[17px] text-[var(--color-accent)] -ml-1 px-1 h-11">Cancel</button>
          <div className="flex-1 text-center text-[17px] font-semibold">{title}</div>
          <button type="button" onClick={onPrimary || onClose} className="press text-[17px] text-[var(--color-accent)] -mr-1 px-1 h-11 font-semibold">{primaryLabel}</button>
        </div>
        <div className="pt-2 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function CenterCard({ open, onClose, children, maxWidth = 340 }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 fadeIn" onClick={onClose} />
      <div
        className="fixed z-50 bg-[var(--color-grouped-bg)] rounded-2xl overflow-hidden border border-white/10 fadeIn"
        style={{
          top: `calc(env(safe-area-inset-top) + 56px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100vw - 32px)',
          maxWidth,
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

export function ConfirmDeleteDialog({ open, itemName, onClose, onConfirm }) {
  return (
    <CenterCard open={open} onClose={onClose}>
      <div className="p-5 text-center">
        <div className="text-[17px] font-semibold">Delete saved session?</div>
        <div className="text-[13px] text-[var(--color-secondary)] mt-1">
          <span className="text-white">{itemName}</span> will be removed from your library. This can’t be undone.
        </div>
      </div>
      <div className="flex border-t border-white/10">
        <button type="button" onClick={onClose} className="press flex-1 h-11 text-[15px] text-[var(--color-accent)]">Cancel</button>
        <div className="w-px bg-white/10" />
        <button type="button" onClick={onConfirm} className="press flex-1 h-11 text-[15px] text-red-400 font-semibold">Delete</button>
      </div>
    </CenterCard>
  );
}
