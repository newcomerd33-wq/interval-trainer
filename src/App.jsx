import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Play, Pause, RotateCcw, SkipForward,
  Volume2, VolumeX, Check, Filter, X,
  Dumbbell, Repeat, Activity,
} from 'lucide-react';

// =============================================================================
// DATA: uniform + asymmetric configs
// =============================================================================
const UNIFORM_TEMPLATES = [
  [15, 45, 2, 10], [15, 45, 4, 5], [15, 45, 5, 4],
  [30, 45, 4, 10], [30, 45, 5, 8], [30, 45, 8, 5],
  [45, 45, 4, 15], [45, 45, 5, 12], [45, 45, 6, 10],
  [60, 45, 8, 10],
  [15, 60, 3, 5], [15, 60, 5, 3],
  [20, 60, 2, 10], [20, 60, 4, 5], [20, 60, 5, 4],
  [30, 60, 2, 15], [30, 60, 3, 10], [30, 60, 5, 6], [30, 60, 6, 5],
  [45, 60, 3, 15], [45, 60, 5, 9],
  [60, 60, 4, 15], [60, 60, 5, 12], [60, 60, 6, 10],
  [15, 75, 2, 6], [15, 75, 3, 4], [15, 75, 4, 3],
  [20, 75, 2, 8], [20, 75, 4, 4],
  [30, 75, 2, 12], [30, 75, 3, 8], [30, 75, 4, 6], [30, 75, 6, 4], [30, 75, 8, 3],
  [45, 75, 3, 12], [45, 75, 4, 9], [45, 75, 6, 6],
  [60, 75, 4, 12], [60, 75, 6, 8], [60, 75, 8, 6],
  [15, 90, 2, 5],
  [30, 90, 2, 10], [30, 90, 4, 5], [30, 90, 5, 4],
  [45, 90, 2, 15], [45, 90, 3, 10], [45, 90, 5, 6], [45, 90, 6, 5],
  [60, 90, 4, 10], [60, 90, 5, 8], [60, 90, 8, 5],
  [20, 120, 2, 5],
  [30, 120, 3, 5], [30, 120, 5, 3],
  [60, 120, 2, 15], [60, 120, 3, 10], [60, 120, 5, 6], [60, 120, 6, 5],
];

function generateMixes(slots) {
  const mixes = [];
  for (let u = 0; u <= Math.floor(slots / 2); u++) {
    mixes.push({ b: slots - 2 * u, u });
  }
  return mixes;
}

const UNIFORM_CONFIGS = UNIFORM_TEMPLATES.flatMap(([duration, intervalSec, slots, sets], tIdx) =>
  generateMixes(slots).map(({ b, u }, mIdx) => ({
    id: `U-${String(tIdx).padStart(2, '0')}${mIdx}`,
    style: 'uniform',
    duration, intervalSec, extendedSec: null, sets,
    bilateral: b, unilateral: u,
    totalEx: b + u,
    slots,
    cycleSec: slots * intervalSec,
    totalSets: (b + u) * sets,
  }))
);

function generateAsymmetricConfigs() {
  const durations = [15, 20, 30, 45, 60];
  const bases = [45, 60, 75, 90, 120];
  const out = [];
  let idx = 0;
  for (const duration of durations) {
    const totalSec = duration * 60;
    for (const intervalSec of bases) {
      const extendedSec = intervalSec + 30;
      for (let b = 0; b <= 7; b++) {
        for (let u = 1; u <= 6 && b + u <= 8; u++) {
          const cycle = b * intervalSec + u * extendedSec;
          if (totalSec % cycle !== 0) continue;
          const rounds = totalSec / cycle;
          if (rounds < 3 || rounds > 20) continue;
          out.push({
            id: `A-${String(idx++).padStart(3, '0')}`,
            style: 'asymmetric',
            duration, intervalSec, extendedSec, sets: rounds,
            bilateral: b, unilateral: u,
            totalEx: b + u,
            slots: b + u,
            cycleSec: cycle,
            totalSets: (b + u) * rounds,
          });
        }
      }
    }
  }
  return out;
}

const CONFIGS = [...UNIFORM_CONFIGS, ...generateAsymmetricConfigs()];

// =============================================================================
// HELPERS
// =============================================================================
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function describeMix(b, u, isAsym) {
  if (b === 0 && u === 0) return '';
  const parts = [];
  if (b > 0) parts.push(`${b} bilateral`);
  if (u > 0) parts.push(`${u} ${isAsym ? 'combined' : 'unilateral'}`);
  return parts.join(' + ');
}

function generateInitialBlocks(bilateral, unilateral) {
  const blocks = [];
  let exNum = 1;
  for (let i = 0; i < bilateral; i++) {
    blocks.push({ id: `b${i}-${Math.random()}`, type: 'B', name: `Exercise ${exNum++}` });
  }
  for (let i = 0; i < unilateral; i++) {
    blocks.push({ id: `u${i}-${Math.random()}`, type: 'U', name: `Exercise ${exNum++}` });
  }
  return blocks;
}

function expandBlocksToSlots(blocks, config) {
  const isAsym = config?.style === 'asymmetric';
  const baseDur = config?.intervalSec ?? null;
  const extDur = config?.extendedSec ?? null;
  const slots = [];
  for (const block of blocks) {
    if (block.type === 'B') {
      slots.push({ name: block.name, side: null, duration: baseDur });
    } else if (block.type === 'A') {
      slots.push({ name: block.name, side: null, alternating: true, duration: baseDur });
    } else if (isAsym) {
      slots.push({ name: block.name, side: null, combined: true, duration: extDur });
    } else {
      slots.push({ name: block.name, side: 'L', duration: baseDur });
      slots.push({ name: block.name, side: 'R', duration: baseDur });
    }
  }
  return slots;
}

// =============================================================================
// AUDIO — richer cues that cut through music
// =============================================================================
let _ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _ctx = new AC();
  }
  if (_ctx && _ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// FM-synth bell: warm, percussive, cuts through ambient noise
function bell({ carrier = 880, modRatio = 1.5, modAmount = 600, modDecay = 0.25, ampDecay = 0.7, gain = 0.5, delay = 0 }) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = carrier * modRatio;

  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(modAmount, now);
  modGain.gain.exponentialRampToValueAtTime(0.001, now + modDecay);

  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.value = carrier;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, now + ampDecay);

  // light high-shelf brightness via biquad
  const filt = ctx.createBiquadFilter();
  filt.type = 'highshelf';
  filt.frequency.value = 4000;
  filt.gain.value = 4;

  mod.connect(modGain);
  modGain.connect(car.frequency);
  car.connect(env);
  env.connect(filt);
  filt.connect(ctx.destination);

  mod.start(now);
  car.start(now);
  mod.stop(now + ampDecay + 0.05);
  car.stop(now + ampDecay + 0.05);
}

// Short percussive click for ticks
function click({ freq = 1800, decay = 0.06, gain = 0.35, delay = 0 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.001);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + decay + 0.02);
}

// Cues
const cue = {
  preTick(n) {
    // ascending pitch through the 3-2-1 countdown
    const freqs = { 3: 660, 2: 784, 1: 932 };
    bell({ carrier: freqs[n] || 660, modRatio: 2, modAmount: 200, modDecay: 0.12, ampDecay: 0.25, gain: 0.55 });
  },
  go() {
    // bright two-note: tonic + fifth, simultaneous
    bell({ carrier: 880, modRatio: 2, modAmount: 700, modDecay: 0.18, ampDecay: 0.55, gain: 0.55 });
    bell({ carrier: 1320, modRatio: 2, modAmount: 700, modDecay: 0.18, ampDecay: 0.55, gain: 0.45 });
  },
  warning3sec() {
    // sharp tick — heard above music
    click({ freq: 2200, decay: 0.07, gain: 0.45 });
  },
  transition() {
    // bell chime at slot change
    bell({ carrier: 1175, modRatio: 1.5, modAmount: 600, modDecay: 0.22, ampDecay: 0.65, gain: 0.6 });
    bell({ carrier: 1568, modRatio: 1.5, modAmount: 500, modDecay: 0.18, ampDecay: 0.5, gain: 0.4, delay: 0.06 });
  },
  halfway() {
    // warm mid-cue — distinct from transition
    bell({ carrier: 988, modRatio: 1, modAmount: 400, modDecay: 0.3, ampDecay: 0.7, gain: 0.55 });
    bell({ carrier: 1318, modRatio: 1, modAmount: 300, modDecay: 0.25, ampDecay: 0.6, gain: 0.4, delay: 0.04 });
  },
  complete() {
    // descending major triad
    bell({ carrier: 1568, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.5, delay: 0 });
    bell({ carrier: 1318, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.5, delay: 0.18 });
    bell({ carrier: 1047, modRatio: 2, modAmount: 500, modDecay: 0.35, ampDecay: 1.1, gain: 0.6, delay: 0.36 });
  },
  tap() {
    click({ freq: 2400, decay: 0.035, gain: 0.18 });
  },
};

// =============================================================================
// UI PRIMITIVES
// =============================================================================
function Surface({ children, className = '', as: As = 'div', ...rest }) {
  return (
    <As
      className={`bg-[var(--color-surface-1)] rounded-2xl ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

function Chip({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-[var(--color-surface-3)] text-ink-1',
    accent: 'bg-[var(--color-accent-glow)] text-[var(--color-accent)]',
    asym: 'bg-[var(--color-asym-glow)] text-[var(--color-asym)]',
    alt: 'bg-cyan-500/15 text-[var(--color-alt)]',
    muted: 'bg-white/5 text-ink-3',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

function IconButton({ icon: Icon, onClick, label, disabled = false, className = '', tone = 'ghost' }) {
  const tones = {
    ghost: 'text-ink-2 hover:text-ink-1 active:bg-white/5',
    surface: 'bg-[var(--color-surface-2)] text-ink-1 hover:bg-[var(--color-surface-3)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`press inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors disabled:opacity-30 ${tones[tone]} ${className}`}
    >
      <Icon size={18} strokeWidth={2.25} />
    </button>
  );
}

function PrimaryButton({ children, onClick, tone = 'accent', icon: Icon = null, className = '', disabled = false }) {
  const styles = {
    accent: 'bg-[var(--color-accent)] text-black shadow-[0_8px_24px_-8px_var(--color-accent-glow)]',
    asym: 'bg-[var(--color-asym)] text-black shadow-[0_8px_24px_-8px_var(--color-asym-glow)]',
    surface: 'bg-[var(--color-surface-2)] text-ink-1 border border-white/8',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press w-full inline-flex items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-semibold tracking-tight transition-all disabled:opacity-40 ${styles[tone]} ${className}`}
    >
      {Icon && <Icon size={18} strokeWidth={2.5} />}
      {children}
    </button>
  );
}

function Segment({ value, options, onChange, tone = 'accent' }) {
  const activeColor = tone === 'asym' ? 'text-[var(--color-asym)]' : 'text-[var(--color-accent)]';
  return (
    <div className="relative grid bg-[var(--color-surface-2)] rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(opt => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { if (!isActive) { cue.tap(); onChange(opt.value); } }}
            className={`press relative z-10 py-2.5 text-[13px] font-semibold tracking-tight transition-colors ${
              isActive ? `bg-[var(--color-surface-3)] rounded-xl ${activeColor}` : 'text-ink-2'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Pill({ active, onClick, children, tone = 'accent' }) {
  const activeStyles = tone === 'asym'
    ? 'bg-[var(--color-asym)] text-black'
    : 'bg-[var(--color-accent)] text-black';
  return (
    <button
      type="button"
      onClick={() => { cue.tap(); onClick(); }}
      className={`press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors ${
        active
          ? activeStyles
          : 'bg-[var(--color-surface-2)] text-ink-2 hover:text-ink-1'
      }`}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`press relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-3)]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function ScreenHeader({ eyebrow, title, right, tone = 'accent' }) {
  const toneColor = tone === 'asym' ? 'text-[var(--color-asym)]' : 'text-[var(--color-accent)]';
  return (
    <div className="flex items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] mb-2 ${toneColor}`}>{eyebrow}</div>}
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-[1.05] text-ink-0">{title}</h1>
      </div>
      {right && <div className="flex items-center gap-1.5 shrink-0">{right}</div>}
    </div>
  );
}

// =============================================================================
// BROWSE VIEW
// =============================================================================
function CompositionGraphic({ config }) {
  // Render a visual rhythm of one round's slots
  const isAsym = config.style === 'asymmetric';
  const slots = [];
  for (let i = 0; i < config.bilateral; i++) slots.push({ kind: 'B' });
  for (let i = 0; i < config.unilateral; i++) {
    if (isAsym) slots.push({ kind: 'C' });
    else { slots.push({ kind: 'L' }); slots.push({ kind: 'R' }); }
  }
  return (
    <div className="flex items-center gap-1">
      {slots.map((s, i) => {
        const isPair = (s.kind === 'L' && slots[i+1]?.kind === 'R');
        const isPairEnd = s.kind === 'R' && slots[i-1]?.kind === 'L';
        const styleMap = {
          B: 'bg-white/12 border-white/10',
          C: 'bg-[var(--color-asym-glow)] border-[var(--color-asym)]/30 text-[var(--color-asym)]',
          L: 'bg-[var(--color-accent-glow)] border-[var(--color-accent)]/30 text-[var(--color-accent)]',
          R: 'bg-[var(--color-accent-glow)] border-[var(--color-accent)]/30 text-[var(--color-accent)]',
        };
        const width = s.kind === 'C' ? 'w-9' : 'w-5';
        const label = s.kind === 'B' ? '' : s.kind === 'C' ? 'L+R' : s.kind;
        return (
          <div
            key={i}
            className={`${width} h-5 rounded-md border flex items-center justify-center text-[9px] font-bold tracking-tighter ${styleMap[s.kind]} ${
              isPair ? 'mr-0' : isPairEnd ? 'ml-0' : ''
            }`}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

function ConfigCard({ config, onSelect }) {
  const isAsym = config.style === 'asymmetric';
  const tone = isAsym ? 'asym' : 'accent';
  const intervalDisplay = isAsym ? `${config.intervalSec}s + ${config.extendedSec}s` : `${config.intervalSec}s base`;

  return (
    <button
      type="button"
      onClick={() => { cue.tap(); onSelect(config); }}
      className="press group block w-full text-left rounded-2xl bg-[var(--color-surface-1)] border border-white/5 hover:border-white/10 transition-colors overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="num text-[32px] font-bold tracking-tight text-ink-0 leading-none">{config.duration}</span>
            <span className="text-[15px] font-medium text-ink-2 leading-none">min</span>
          </div>
          <div className="mt-1.5 text-[13px] text-ink-3 leading-snug">{intervalDisplay}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {isAsym && <Chip tone="asym">ASYM</Chip>}
          <div className="flex items-center gap-1 text-[12px] text-ink-2">
            <Dumbbell size={12} strokeWidth={2.5} />
            <span className="font-semibold">{config.totalEx}</span>
            <span className="text-ink-3">ex</span>
          </div>
        </div>
      </div>

      <div className="mx-5 h-px bg-white/5" />

      <div className="px-5 py-4 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Sets/ex</div>
          <div className="num text-[18px] font-bold text-ink-1">{config.sets}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Total</div>
          <div className="num text-[18px] font-bold text-ink-1">{config.totalSets}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Cycle</div>
          <div className="num text-[18px] font-bold text-ink-1">{formatTime(config.cycleSec)}</div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CompositionGraphic config={config} />
        </div>
        <div className={`flex items-center gap-1 text-[12px] font-semibold transition-colors ${
          isAsym ? 'text-[var(--color-asym)]' : 'text-[var(--color-accent)]'
        }`}>
          Set up
          <ChevronRight size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
}

function FilterSheet({ open, onClose, state, setState, styleFilter }) {
  if (!open) return null;
  const tone = styleFilter === 'asymmetric' ? 'asym' : 'accent';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-auto bg-[var(--color-surface-1)] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/8 shadow-2xl fade-up">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-[18px] font-bold tracking-tight">Filters</h3>
          <IconButton icon={X} onClick={onClose} label="Close" />
        </div>
        <div className="px-5 pb-6 space-y-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-3">Duration</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={state.duration === 'all'} onClick={() => setState(s => ({ ...s, duration: 'all' }))} tone={tone}>Any</Pill>
              {[15, 20, 30, 45, 60].map(d => (
                <Pill key={d} active={state.duration === d} onClick={() => setState(s => ({ ...s, duration: d }))} tone={tone}>{d} min</Pill>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-3">Base interval</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={state.intervalSec === 'all'} onClick={() => setState(s => ({ ...s, intervalSec: 'all' }))} tone={tone}>Any</Pill>
              {[45, 60, 75, 90, 120].map(i => (
                <Pill key={i} active={state.intervalSec === i} onClick={() => setState(s => ({ ...s, intervalSec: i }))} tone={tone}>{i}s</Pill>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-3">Exercises</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={state.exCount === 'any'} onClick={() => setState(s => ({ ...s, exCount: 'any' }))} tone={tone}>Any</Pill>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <Pill key={n} active={state.exCount === n} onClick={() => setState(s => ({ ...s, exCount: n }))} tone={tone}>{n}</Pill>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-3">Unilateral content</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill active={state.uniFilter === 'any'} onClick={() => setState(s => ({ ...s, uniFilter: 'any' }))} tone={tone}>Any</Pill>
              <Pill active={state.uniFilter === 'none'} onClick={() => setState(s => ({ ...s, uniFilter: 'none' }))} tone={tone}>All bilateral</Pill>
              <Pill active={state.uniFilter === 'some'} onClick={() => setState(s => ({ ...s, uniFilter: 'some' }))} tone={tone}>Has unilateral</Pill>
              <Pill active={state.uniFilter === 'pure'} onClick={() => setState(s => ({ ...s, uniFilter: 'pure' }))} tone={tone}>All unilateral</Pill>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Minimum sets per exercise</span>
              <span className="num text-[14px] font-bold text-ink-1">{state.minSets}</span>
            </div>
            <input
              type="range" min="3" max="15" value={state.minSets}
              onChange={e => setState(s => ({ ...s, minSets: parseInt(e.target.value) }))}
              className="w-full"
              style={{ accentColor: tone === 'asym' ? 'var(--color-asym)' : 'var(--color-accent)' }}
            />
          </div>

          <div className="pt-2">
            <PrimaryButton onClick={onClose} tone={tone === 'asym' ? 'asym' : 'accent'} icon={Check}>
              Apply
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrowseView({ onSelectConfig }) {
  const [styleFilter, setStyleFilter] = useState('uniform');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    duration: 'all', intervalSec: 'all', exCount: 'any', uniFilter: 'any', minSets: 3,
  });

  const setStyleAndAdjust = (next) => {
    setStyleFilter(next);
    setFilters(f => ({ ...f, uniFilter: next === 'asymmetric' ? 'some' : 'any' }));
  };

  const filtered = useMemo(() => CONFIGS.filter(c => {
    if (c.style !== styleFilter) return false;
    if (filters.duration !== 'all' && c.duration !== filters.duration) return false;
    if (filters.intervalSec !== 'all' && c.intervalSec !== filters.intervalSec) return false;
    if (filters.exCount !== 'any' && c.totalEx !== filters.exCount) return false;
    if (c.sets < filters.minSets) return false;
    if (filters.uniFilter === 'none' && c.unilateral > 0) return false;
    if (filters.uniFilter === 'some' && c.unilateral === 0) return false;
    if (filters.uniFilter === 'pure' && c.bilateral > 0) return false;
    return true;
  }), [styleFilter, filters]);

  const styleTotal = useMemo(() => CONFIGS.filter(c => c.style === styleFilter).length, [styleFilter]);

  const activeFilterCount =
    (filters.duration !== 'all' ? 1 : 0) +
    (filters.intervalSec !== 'all' ? 1 : 0) +
    (filters.exCount !== 'any' ? 1 : 0) +
    (filters.uniFilter !== 'any' && filters.uniFilter !== (styleFilter === 'asymmetric' ? 'some' : 'any') ? 1 : 0) +
    (filters.minSets > 3 ? 1 : 0);

  return (
    <div className="fade-up">
      <ScreenHeader
        eyebrow="Interval Trainer"
        title="Pick a session"
        tone={styleFilter === 'asymmetric' ? 'asym' : 'accent'}
        right={
          <IconButton
            icon={Filter}
            onClick={() => { cue.tap(); setFilterOpen(true); }}
            label="Filters"
            tone="surface"
          />
        }
      />

      <div className="mb-5">
        <Segment
          value={styleFilter}
          onChange={setStyleAndAdjust}
          tone={styleFilter === 'asymmetric' ? 'asym' : 'accent'}
          options={[
            { value: 'uniform', label: 'Uniform' },
            { value: 'asymmetric', label: 'Asymmetric' },
          ]}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <span className={`num text-[24px] font-bold tracking-tight ${styleFilter === 'asymmetric' ? 'text-[var(--color-asym)]' : 'text-[var(--color-accent)]'}`}>
            {filtered.length}
          </span>
          <span className="text-[13px] text-ink-3">of {styleTotal}</span>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({ duration: 'all', intervalSec: 'all', exCount: 'any', uniFilter: styleFilter === 'asymmetric' ? 'some' : 'any', minSets: 3 })}
            className="text-[12px] font-medium text-ink-3 hover:text-ink-1 transition-colors"
          >
            Clear filters · {activeFilterCount}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Surface className="py-14 text-center">
          <div className="text-[14px] text-ink-3">No sessions match those filters.</div>
        </Surface>
      ) : (
        <div className="space-y-2.5 fade-up-stagger">
          {filtered.map(c => <ConfigCard key={c.id} config={c} onSelect={onSelectConfig} />)}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        state={filters}
        setState={setFilters}
        styleFilter={styleFilter}
      />
    </div>
  );
}

// =============================================================================
// CONFIGURE VIEW
// =============================================================================
function BlockRow({ block, idx, total, onMoveUp, onMoveDown, onRename, onToggleType }) {
  const isU = block.type === 'U';
  const isA = block.type === 'A';
  const typeBadge = isU ? 'Per-side' : isA ? 'Alternating' : 'Bilateral';
  const typeTone = isU ? 'accent' : isA ? 'alt' : 'muted';

  return (
    <Surface className="px-4 py-3.5 flex items-center gap-3 border border-white/5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <button
            type="button"
            onClick={isU ? undefined : () => { cue.tap(); onToggleType(); }}
            disabled={isU}
            className={`press inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              isU ? 'bg-[var(--color-accent-glow)] text-[var(--color-accent)] cursor-default'
                : isA ? 'bg-cyan-500/15 text-[var(--color-alt)] hover:bg-cyan-500/25'
                : 'bg-white/8 text-ink-2 hover:bg-white/12'
            }`}
          >
            {isA && <Repeat size={9} strokeWidth={3} />}
            {isU && <Activity size={9} strokeWidth={3} />}
            {typeBadge}
          </button>
          <span className="text-[10.5px] text-ink-3 font-medium">#{idx + 1}</span>
        </div>
        <input
          type="text"
          value={block.name}
          onChange={e => onRename(e.target.value)}
          placeholder={`Exercise ${idx + 1}`}
          className="w-full bg-transparent text-[16px] font-semibold text-ink-0 placeholder:text-ink-4 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => { cue.tap(); onMoveUp(); }}
          disabled={idx === 0}
          className="press w-8 h-7 rounded-lg bg-[var(--color-surface-3)] text-ink-2 hover:text-ink-0 disabled:opacity-25 flex items-center justify-center transition-colors"
        >
          <ChevronUp size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => { cue.tap(); onMoveDown(); }}
          disabled={idx === total - 1}
          className="press w-8 h-7 rounded-lg bg-[var(--color-surface-3)] text-ink-2 hover:text-ink-0 disabled:opacity-25 flex items-center justify-center transition-colors"
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
      </div>
    </Surface>
  );
}

function ConfigureView({ config, blocks, setBlocks, onBack, onStart }) {
  const isAsym = config.style === 'asymmetric';
  const tone = isAsym ? 'asym' : 'accent';

  const moveBlock = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setBlocks(next);
  };
  const updateName = (idx, name) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], name };
    setBlocks(next);
  };
  const toggleType = (idx) => {
    const next = [...blocks];
    if (next[idx].type === 'U') return;
    next[idx] = { ...next[idx], type: next[idx].type === 'B' ? 'A' : 'B' };
    setBlocks(next);
  };

  const previewSlots = expandBlocksToSlots(blocks, config);

  return (
    <div className="fade-up">
      <div className="flex items-center -ml-2 mb-3">
        <IconButton icon={ChevronLeft} onClick={() => { cue.tap(); onBack(); }} label="Back" />
        <span className="text-[14px] text-ink-2 ml-1">Sessions</span>
      </div>

      <ScreenHeader
        eyebrow={isAsym ? 'Asymmetric session' : 'Session setup'}
        title="Build your round"
        tone={tone}
      />

      <Surface className="p-4 mb-6 border border-white/5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Duration</div>
            <div className="num text-[18px] font-bold text-ink-0">{config.duration} <span className="text-[12px] text-ink-3 font-medium">min</span></div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Interval</div>
            <div className="num text-[18px] font-bold text-ink-0">
              {isAsym ? `${config.intervalSec}+${config.extendedSec}` : config.intervalSec}<span className="text-[12px] text-ink-3 font-medium">s</span>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1">Total sets</div>
            <div className="num text-[18px] font-bold text-ink-0">{config.totalSets}</div>
          </div>
        </div>
      </Surface>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight text-ink-1">Exercises</h2>
        <span className="text-[12px] text-ink-3">tap badge · rename · reorder</span>
      </div>

      <div className="space-y-2 mb-6">
        {blocks.map((block, idx) => (
          <BlockRow
            key={block.id}
            block={block}
            idx={idx}
            total={blocks.length}
            onMoveUp={() => moveBlock(idx, -1)}
            onMoveDown={() => moveBlock(idx, 1)}
            onRename={(name) => updateName(idx, name)}
            onToggleType={() => toggleType(idx)}
          />
        ))}
      </div>

      <Surface className="p-4 mb-6 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-ink-2">Round sequence</h3>
          <span className="text-[12px] text-ink-3">× {config.sets} rounds</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {previewSlots.map((slot, idx) => {
            const cls = slot.combined
              ? 'bg-[var(--color-asym-glow)] text-[var(--color-asym)] border-[var(--color-asym)]/30'
              : slot.alternating
              ? 'bg-cyan-500/15 text-[var(--color-alt)] border-cyan-400/30'
              : slot.side
              ? 'bg-[var(--color-accent-glow)] text-[var(--color-accent)] border-[var(--color-accent)]/30'
              : 'bg-white/8 text-ink-1 border-white/8';
            const suffix = slot.combined ? ` · L+R` : slot.alternating ? ` · alt` : slot.side ? ` · ${slot.side}` : '';
            return (
              <span key={idx} className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[12px] font-medium ${cls}`}>
                {slot.name}{suffix}
              </span>
            );
          })}
        </div>
      </Surface>

      <PrimaryButton onClick={() => { cue.tap(); onStart(); }} tone={tone} icon={Play}>
        Start workout
      </PrimaryButton>
    </div>
  );
}

// =============================================================================
// TIMER VIEW
// =============================================================================
function ProgressRing({ progress, color, size = 280, stroke = 8 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;
  return (
    <svg width={size} height={size} className="absolute inset-0 m-auto" style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.4s linear' }}
      />
    </svg>
  );
}

function TimerView({ config, blocks, onBack }) {
  const slots = useMemo(() => expandBlocksToSlots(blocks, config), [blocks, config]);
  const totalSlots = slots.length * config.sets;
  const isAsym = config.style === 'asymmetric';
  const tone = isAsym ? 'asym' : 'accent';

  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => slots[0]?.duration ?? config.intervalSec);
  const [running, setRunning] = useState(false);
  const [preCount, setPreCount] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  const prevIdxRef = useRef(0);
  const midCueFiredRef = useRef(false);

  const isComplete = currentIdx >= totalSlots;
  const currentSlot = !isComplete ? slots[currentIdx % slots.length] : null;
  const nextSlot = currentIdx + 1 < totalSlots ? slots[(currentIdx + 1) % slots.length] : null;
  const currentSet = isComplete ? config.sets : Math.floor(currentIdx / slots.length) + 1;

  // pre-countdown
  useEffect(() => {
    if (preCount === null) return;
    if (preCount === 0) {
      const t = setTimeout(() => {
        setPreCount(null);
        setRunning(true);
        if (audioOn) cue.go();
      }, 600);
      return () => clearTimeout(t);
    }
    if (audioOn) cue.preTick(preCount);
    const t = setTimeout(() => setPreCount(preCount - 1), 1000);
    return () => clearTimeout(t);
  }, [preCount, audioOn]);

  // main tick
  useEffect(() => {
    if (!running) return;
    if (currentIdx >= totalSlots) {
      setRunning(false);
      return;
    }
    const slot = slots[currentIdx % slots.length];
    const halfway = slot.combined ? Math.ceil(slot.duration / 2) : null;
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev > 1) {
          if (prev === 4 && audioOn) cue.warning3sec();
          if (slot.combined && !midCueFiredRef.current && prev === halfway && audioOn) {
            cue.halfway();
            midCueFiredRef.current = true;
          }
          return prev - 1;
        }
        const newIdx = currentIdx + 1;
        setCurrentIdx(newIdx);
        midCueFiredRef.current = false;
        if (newIdx >= totalSlots) return 0;
        return slots[newIdx % slots.length].duration;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running, currentIdx, totalSlots, slots, audioOn]);

  // transition beeps + completion fanfare
  useEffect(() => {
    if (currentIdx === prevIdxRef.current) return;
    if (currentIdx > 0 && currentIdx < totalSlots && audioOn) cue.transition();
    if (currentIdx >= totalSlots && audioOn) cue.complete();
    prevIdxRef.current = currentIdx;
  }, [currentIdx, totalSlots, audioOn]);

  // wake lock
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    if (running && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen')
        .then(l => { if (!cancelled) lock = l; })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (lock) lock.release().catch(() => {});
    };
  }, [running]);

  const start = () => {
    if (isComplete) {
      setCurrentIdx(0);
      setSecondsLeft(slots[0].duration);
      prevIdxRef.current = 0;
      midCueFiredRef.current = false;
    }
    setPreCount(3);
  };
  const pause = () => { cue.tap(); setRunning(false); };
  const resume = () => { cue.tap(); setRunning(true); };
  const reset = () => {
    cue.tap();
    setRunning(false);
    setPreCount(null);
    setCurrentIdx(0);
    setSecondsLeft(slots[0].duration);
    prevIdxRef.current = 0;
    midCueFiredRef.current = false;
  };
  const skip = () => {
    if (isComplete) return;
    cue.tap();
    const newIdx = currentIdx + 1;
    setCurrentIdx(newIdx);
    midCueFiredRef.current = false;
    if (newIdx >= totalSlots) setSecondsLeft(0);
    else setSecondsLeft(slots[newIdx % slots.length].duration);
  };

  const showPre = preCount !== null;
  const hasStarted = currentIdx > 0 || running;
  const slotDuration = currentSlot?.duration ?? config.intervalSec;
  const slotProgress = currentSlot ? 1 - secondsLeft / slotDuration : 0;
  const ringColor = currentSlot?.combined
    ? 'var(--color-asym)'
    : currentSlot?.alternating
    ? 'var(--color-alt)'
    : 'var(--color-accent)';
  const sessionProgress = currentIdx / totalSlots;

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between mb-4 -ml-2">
        <button
          type="button"
          onClick={() => { cue.tap(); onBack(); }}
          className="press inline-flex items-center gap-1 text-[14px] text-ink-2 hover:text-ink-0 pl-2 pr-3 py-2 -my-2 rounded-lg"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
          Setup
        </button>
        <div className="flex items-center gap-2">
          {isAsym && <Chip tone="asym">ASYM</Chip>}
          <span className="text-[12px] text-ink-3 font-medium tabular">
            {config.duration} min · {isAsym ? `${config.intervalSec}+${config.extendedSec}` : config.intervalSec}s
          </span>
        </div>
      </div>

      {/* Session progress bar */}
      <div className="mb-7">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${sessionProgress * 100}%`, background: ringColor }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3 tabular">
          <span>Round <span className="text-ink-1 font-semibold">{currentSet}</span> of {config.sets}</span>
          <span><span className="text-ink-1 font-semibold">{currentIdx}</span> / {totalSlots} sets</span>
        </div>
      </div>

      {showPre && (
        <div className="flex flex-col items-center justify-center py-16 fade-up">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-3">Get ready</div>
          <div className="num text-[140px] font-bold leading-none" style={{ color: ringColor }}>
            {preCount === 0 ? 'GO' : preCount}
          </div>
        </div>
      )}

      {isComplete && !showPre && (
        <div className="flex flex-col items-center justify-center py-14 fade-up">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
               style={{ background: `radial-gradient(circle, ${ringColor}33, transparent 70%)` }}>
            <Check size={36} strokeWidth={2.5} style={{ color: ringColor }} />
          </div>
          <div className="text-[28px] font-bold tracking-tight text-ink-0 mb-1">Session complete</div>
          <div className="text-[14px] text-ink-3 tabular">{config.totalSets} sets · {config.duration} minutes</div>
        </div>
      )}

      {!showPre && !isComplete && currentSlot && (
        <>
          {/* Hero ring + countdown */}
          <div className="relative mx-auto mb-7" style={{ width: 280, height: 280 }}>
            <ProgressRing progress={slotProgress} color={ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="num text-[88px] sm:text-[96px] font-bold leading-none tracking-tight tabular" style={{ color: ringColor }}>
                {secondsLeft}
              </div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink-3 mt-1">seconds</div>
            </div>
          </div>

          {/* Current exercise */}
          <div className="text-center mb-6">
            <div className="text-[24px] sm:text-[26px] font-bold tracking-tight text-ink-0 leading-tight">
              {currentSlot.name}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              {currentSlot.side && (
                <Chip tone="accent">{currentSlot.side === 'L' ? 'Left side' : 'Right side'}</Chip>
              )}
              {currentSlot.alternating && (
                <Chip tone="alt"><Repeat size={11} strokeWidth={3} /> Alternating L / R</Chip>
              )}
              {currentSlot.combined && (
                <Chip tone="asym"><Activity size={11} strokeWidth={3} /> Combined · L + R</Chip>
              )}
            </div>
          </div>

          {/* Next up */}
          {nextSlot && (
            <Surface className="px-4 py-3 mb-6 border border-white/5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-0.5">Next</div>
                <div className="text-[15px] font-semibold text-ink-1 truncate">{nextSlot.name}</div>
              </div>
              <div className="shrink-0">
                {nextSlot.side && <Chip tone="muted">{nextSlot.side}</Chip>}
                {nextSlot.alternating && <Chip tone="alt">alt</Chip>}
                {nextSlot.combined && <Chip tone="asym">L+R · {nextSlot.duration}s</Chip>}
              </div>
            </Surface>
          )}
        </>
      )}

      {/* Controls */}
      {!showPre && (
        <div className="space-y-2.5">
          {!running && !isComplete && (
            <PrimaryButton onClick={() => { cue.tap(); hasStarted ? resume() : start(); }} tone={tone} icon={Play}>
              {hasStarted ? 'Resume' : 'Start workout'}
            </PrimaryButton>
          )}
          {running && (
            <PrimaryButton onClick={pause} tone="surface" icon={Pause}>Pause</PrimaryButton>
          )}
          {isComplete && (
            <PrimaryButton onClick={start} tone={tone} icon={Play}>Run again</PrimaryButton>
          )}
          {hasStarted && !isComplete && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={skip}
                className="press py-3 rounded-2xl bg-[var(--color-surface-2)] text-ink-1 text-[14px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--color-surface-3)]"
              >
                <SkipForward size={15} strokeWidth={2.5} />
                Skip
              </button>
              <button
                type="button"
                onClick={reset}
                className="press py-3 rounded-2xl bg-[var(--color-surface-2)] text-ink-1 text-[14px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--color-surface-3)]"
              >
                <RotateCcw size={15} strokeWidth={2.5} />
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audio toggle */}
      <div className="mt-7 pt-5 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {audioOn ? <Volume2 size={16} className="text-ink-2" strokeWidth={2.25} /> : <VolumeX size={16} className="text-ink-3" strokeWidth={2.25} />}
          <span className="text-[13px] text-ink-2 font-medium">Audio cues</span>
        </div>
        <Switch checked={audioOn} onChange={setAudioOn} />
      </div>
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================
export default function App() {
  const [view, setView] = useState('browse');
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [blocks, setBlocks] = useState([]);

  const handleSelectConfig = (config) => {
    setSelectedConfig(config);
    setBlocks(generateInitialBlocks(config.bilateral, config.unilateral));
    setView('configure');
  };

  return (
    <div
      className="min-h-screen text-ink-1"
      style={{
        background: 'radial-gradient(120% 80% at 50% -10%, rgba(255,181,71,0.06), transparent 60%), var(--color-surface-0)',
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
      }}
    >
      <div className="max-w-md mx-auto px-5">
        {view === 'browse' && <BrowseView onSelectConfig={handleSelectConfig} />}
        {view === 'configure' && (
          <ConfigureView
            config={selectedConfig}
            blocks={blocks}
            setBlocks={setBlocks}
            onBack={() => setView('browse')}
            onStart={() => setView('timer')}
          />
        )}
        {view === 'timer' && (
          <TimerView
            config={selectedConfig}
            blocks={blocks}
            onBack={() => setView('configure')}
          />
        )}
      </div>
    </div>
  );
}
