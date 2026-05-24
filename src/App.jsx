import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronRight, ChevronLeft, Check, Play, Pause, RotateCcw, SkipForward,
  Volume2, VolumeX, Plus, Minus, X, Sliders, Bookmark, Trash2,
} from 'lucide-react';

// =============================================================================
// DATA — preset configs
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

function mixesFor(slots) {
  const out = [];
  for (let u = 0; u <= Math.floor(slots / 2); u++) out.push({ b: slots - 2 * u, u });
  return out;
}

const UNIFORM_CONFIGS = UNIFORM_TEMPLATES.flatMap(([duration, intervalSec, slots, sets], tIdx) =>
  mixesFor(slots).map(({ b, u }, mIdx) => ({
    id: `U-${tIdx}-${mIdx}`,
    style: 'uniform',
    duration, intervalSec, extendedSec: null, sets,
    bilateral: b, unilateral: u, totalEx: b + u, slots,
    cycleSec: slots * intervalSec,
    totalSets: (b + u) * sets,
  }))
);

function asymConfigs() {
  const out = [];
  let idx = 0;
  for (const d of [15, 20, 30, 45, 60]) {
    const totalSec = d * 60;
    for (const intervalSec of [45, 60, 75, 90, 120]) {
      const ext = intervalSec + 30;
      for (let b = 0; b <= 7; b++) {
        for (let u = 1; u <= 6 && b + u <= 8; u++) {
          const cycle = b * intervalSec + u * ext;
          if (totalSec % cycle !== 0) continue;
          const rounds = totalSec / cycle;
          if (rounds < 3 || rounds > 20) continue;
          out.push({
            id: `A-${idx++}`,
            style: 'asymmetric',
            duration: d, intervalSec, extendedSec: ext, sets: rounds,
            bilateral: b, unilateral: u, totalEx: b + u, slots: b + u,
            cycleSec: cycle,
            totalSets: (b + u) * rounds,
          });
        }
      }
    }
  }
  return out;
}

const CONFIGS = [...UNIFORM_CONFIGS, ...asymConfigs()];
const CONFIG_BY_ID = Object.fromEntries(CONFIGS.map(c => [c.id, c]));

// =============================================================================
// HELPERS
// =============================================================================
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtSec(s) {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec === 0 ? `${m} min` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  return `${s}s`;
}
function describeMix(b, u, isAsym) {
  const parts = [];
  if (b > 0) parts.push(`${b} bilateral`);
  if (u > 0) parts.push(`${u} ${isAsym ? 'combined' : 'unilateral'}`);
  return parts.join(', ');
}
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function makeBlocks(b, u) {
  const blocks = [];
  let n = 1;
  for (let i = 0; i < b; i++) blocks.push({ id: uid(), type: 'B', name: `Exercise ${n++}` });
  for (let i = 0; i < u; i++) blocks.push({ id: uid(), type: 'U', name: `Exercise ${n++}` });
  return blocks;
}

// Expand preset (config + blocks) into the FULL flat slots list for the whole session
function buildPresetSession(config, blocks) {
  const isAsym = config.style === 'asymmetric';
  const base = config.intervalSec;
  const ext = config.extendedSec;
  const roundSlots = [];
  for (const block of blocks) {
    if (block.type === 'B') roundSlots.push({ name: block.name, duration: base });
    else if (block.type === 'A') roundSlots.push({ name: block.name, duration: base, alternating: true });
    else if (isAsym) roundSlots.push({ name: block.name, duration: ext, combined: true });
    else { roundSlots.push({ name: block.name, duration: base, side: 'L' }); roundSlots.push({ name: block.name, duration: base, side: 'R' }); }
  }
  const slots = [];
  for (let r = 1; r <= config.sets; r++) {
    for (const s of roundSlots) slots.push({ ...s, meta: { round: r, totalRounds: config.sets } });
  }
  return {
    type: 'preset',
    style: config.style,
    slots,
    totalSets: config.totalSets,
    totalDurationSec: config.duration * 60,
    durationMin: config.duration,
    metaLine: isAsym
      ? `${config.duration} min · ${base}s + ${ext}s`
      : `${config.duration} min · ${base}s`,
  };
}

// Expand a custom session to flat slots
function buildCustomSession(custom) {
  const slots = [];
  let totalSets = 0;
  let totalDurationSec = 0;
  custom.circuits.forEach((circuit, ci) => {
    for (let r = 1; r <= circuit.rounds; r++) {
      for (const ex of circuit.exercises) {
        slots.push({
          name: ex.name,
          duration: ex.duration,
          unilateral: ex.mode === 'unilateral',
          meta: { circuit: ci + 1, totalCircuits: custom.circuits.length, round: r, totalRoundsInCircuit: circuit.rounds },
        });
        totalSets++;
        totalDurationSec += ex.duration;
      }
    }
    if (ci < custom.circuits.length - 1 && circuit.restAfterSec > 0) {
      slots.push({
        name: 'Rest',
        duration: circuit.restAfterSec,
        isRest: true,
        meta: { circuit: ci + 1, totalCircuits: custom.circuits.length, isRest: true },
      });
      totalDurationSec += circuit.restAfterSec;
    }
  });
  const totalMin = Math.round(totalDurationSec / 60);
  return {
    type: 'custom',
    slots, totalSets, totalDurationSec,
    durationMin: totalMin,
    metaLine: `${totalMin} min · ${custom.circuits.length} circuit${custom.circuits.length > 1 ? 's' : ''}`,
  };
}

// =============================================================================
// LIBRARY STORAGE (localStorage)
// =============================================================================
const LIB_KEY = 'interval-trainer-library-v1';

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistLibrary(items) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(items)); } catch {}
}

// =============================================================================
// AUDIO
// =============================================================================
let _ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _ctx = new AC();
  }
  if (_ctx?.state === 'suspended') _ctx.resume();
  return _ctx;
}
function bell({ carrier = 880, modRatio = 1.5, modAmount = 600, modDecay = 0.25, ampDecay = 0.7, gain = 0.55, delay = 0 }) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = carrier * modRatio;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(modAmount, now);
  modGain.gain.exponentialRampToValueAtTime(0.001, now + modDecay);
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = carrier;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, now + ampDecay);
  const filt = ctx.createBiquadFilter(); filt.type = 'highshelf'; filt.frequency.value = 4000; filt.gain.value = 4;
  mod.connect(modGain); modGain.connect(car.frequency);
  car.connect(env); env.connect(filt); filt.connect(ctx.destination);
  mod.start(now); car.start(now);
  mod.stop(now + ampDecay + 0.05); car.stop(now + ampDecay + 0.05);
}
function tone({ freq = 1800, decay = 0.06, gain = 0.4, delay = 0 } = {}) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator(); osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.001);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.connect(env); env.connect(ctx.destination);
  osc.start(now); osc.stop(now + decay + 0.02);
}
const cues = {
  preTick(n) { bell({ carrier: { 3: 660, 2: 784, 1: 932 }[n] ?? 660, modRatio: 2, modAmount: 200, modDecay: 0.12, ampDecay: 0.25, gain: 0.55 }); },
  go() {
    bell({ carrier: 880, modRatio: 2, modAmount: 700, modDecay: 0.18, ampDecay: 0.55, gain: 0.6 });
    bell({ carrier: 1320, modRatio: 2, modAmount: 700, modDecay: 0.18, ampDecay: 0.55, gain: 0.45 });
  },
  warning3sec() { tone({ freq: 2200, decay: 0.07, gain: 0.48 }); },
  transition() {
    bell({ carrier: 1175, modRatio: 1.5, modAmount: 600, modDecay: 0.22, ampDecay: 0.65, gain: 0.62 });
    bell({ carrier: 1568, modRatio: 1.5, modAmount: 500, modDecay: 0.18, ampDecay: 0.5, gain: 0.42, delay: 0.06 });
  },
  halfway() {
    bell({ carrier: 988, modRatio: 1, modAmount: 400, modDecay: 0.3, ampDecay: 0.7, gain: 0.58 });
    bell({ carrier: 1318, modRatio: 1, modAmount: 300, modDecay: 0.25, ampDecay: 0.6, gain: 0.42, delay: 0.04 });
  },
  enterRest() {
    bell({ carrier: 523, modRatio: 1, modAmount: 240, modDecay: 0.5, ampDecay: 0.9, gain: 0.42 });
  },
  complete() {
    bell({ carrier: 1568, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.52, delay: 0 });
    bell({ carrier: 1318, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.52, delay: 0.18 });
    bell({ carrier: 1047, modRatio: 2, modAmount: 500, modDecay: 0.35, ampDecay: 1.1, gain: 0.6, delay: 0.36 });
  },
};

// =============================================================================
// PRIMITIVES
// =============================================================================
function NavBar({ title, leftLabel, onLeft, rightLabel, onRight, rightDisabled, rightIcon: RightIcon }) {
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

function GroupHeader({ children }) {
  return <div className="px-4 mt-6 mb-1.5 text-[13px] uppercase tracking-wide text-[var(--color-secondary)]">{children}</div>;
}
function GroupFooter({ children }) {
  return <div className="px-4 mt-1.5 text-[13px] text-[var(--color-secondary)] leading-snug">{children}</div>;
}
function Group({ children, className = '' }) {
  return <div className={`mx-4 rounded-xl bg-[var(--color-cell)] overflow-hidden ${className}`}>{children}</div>;
}

function Row({ children, onClick, selected, disabled, trailing, subtitle, leading, danger, className = '' }) {
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

function Stepper({ value, min = 5, max = 600, step = 5, onChange }) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className="inline-flex items-center gap-1 bg-[var(--color-cell-pressed)] rounded-lg px-1 py-1">
      <button type="button" onClick={dec} disabled={value <= min} className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center">
        <Minus size={15} strokeWidth={2.5} />
      </button>
      <div className="tabular text-[15px] font-semibold min-w-[44px] text-center">{fmtSec(value)}</div>
      <button type="button" onClick={inc} disabled={value >= max} className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center">
        <Plus size={15} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function Sheet({ open, onClose, title, children, primaryLabel = 'Done', onPrimary }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 fadeIn" />
      <div className="relative w-full max-w-[440px] mx-auto bg-[var(--color-grouped-bg)] rounded-t-2xl pb-[max(env(safe-area-inset-bottom),16px)] slideIn"
        onClick={e => e.stopPropagation()}>
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

// =============================================================================
// WIZARD
// =============================================================================
const WIZARD_STEPS = ['duration', 'style', 'interval', 'composition', 'results'];

function Wizard({ onPickConfig, onPickCustom, onOpenLibrary, libraryCount }) {
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState({ duration: null, style: null, intervalSec: null, composition: null });
  const set = (key, value) => { setChoices(c => ({ ...c, [key]: value })); setStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1)); };
  const back = () => setStep(s => Math.max(s - 1, 0));
  const restart = () => { setChoices({ duration: null, style: null, intervalSec: null, composition: null }); setStep(0); };

  const filtered = useMemo(() => CONFIGS.filter(c => {
    if (choices.duration && c.duration !== choices.duration) return false;
    if (choices.style && c.style !== choices.style) return false;
    if (choices.intervalSec && c.intervalSec !== choices.intervalSec) return false;
    if (choices.composition === 'bilateral' && c.unilateral > 0) return false;
    if (choices.composition === 'mixed' && (c.unilateral === 0 || c.bilateral === 0)) return false;
    if (choices.composition === 'unilateral' && c.bilateral > 0) return false;
    return true;
  }), [choices]);

  const validFor = (key, pool) => {
    const remaining = CONFIGS.filter(c => {
      for (const [k, v] of Object.entries(choices)) {
        if (k === key || !v) continue;
        if (k === 'composition') {
          if (v === 'bilateral' && c.unilateral > 0) return false;
          if (v === 'mixed' && (c.unilateral === 0 || c.bilateral === 0)) return false;
          if (v === 'unilateral' && c.bilateral > 0) return false;
        } else if (c[k] !== v) return false;
      }
      return true;
    });
    return pool.filter(opt => remaining.some(c => {
      if (key === 'composition') {
        if (opt === 'bilateral') return c.unilateral === 0;
        if (opt === 'mixed') return c.unilateral > 0 && c.bilateral > 0;
        if (opt === 'unilateral') return c.bilateral === 0 && c.unilateral > 0;
      }
      return c[key] === opt;
    }));
  };

  const stepName = WIZARD_STEPS[step];

  return (
    <div className="slideIn pb-8" key={step}>
      <NavBar
        title="New session"
        leftLabel={step === 0 ? null : 'Back'}
        onLeft={step === 0 ? null : back}
        rightLabel={step === 0 ? (libraryCount > 0 ? `Saved · ${libraryCount}` : 'Saved') : 'Restart'}
        onRight={step === 0 ? onOpenLibrary : restart}
      />

      <div className="px-4 mt-1 mb-2 flex items-center gap-1.5">
        {WIZARD_STEPS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-cell)]'}`} />
        ))}
      </div>

      {stepName === 'duration' && (
        <>
          <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">How long?</h1>
          <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">Total session length, including all work intervals.</p>
          <GroupHeader>Duration</GroupHeader>
          <Group>
            {[15, 20, 30, 45, 60].map(d => <Row key={d} onClick={() => set('duration', d)}>{d} minutes</Row>)}
          </Group>
          <GroupHeader>Or build your own</GroupHeader>
          <Group>
            <Row onClick={onPickCustom} subtitle="Set your own exercises, timers, circuits, and rest." leading={<Sliders size={20} strokeWidth={2.2} className="text-[var(--color-accent)]" />}>
              Custom timer
            </Row>
          </Group>
        </>
      )}

      {stepName === 'style' && (
        <>
          <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Interval style</h1>
          <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">All slots same length, or extra time for combined unilateral?</p>
          <GroupHeader>Choose one</GroupHeader>
          <Group>
            <Row onClick={() => set('style', 'uniform')} subtitle="Every slot the same length. Unilateral splits into two slots (L then R).">Uniform</Row>
            <Row onClick={() => set('style', 'asymmetric')} subtitle="Bilateral on base interval. Unilateral fits L + R in one extended slot (base + 30s).">Asymmetric</Row>
          </Group>
        </>
      )}

      {stepName === 'interval' && (() => {
        const options = validFor('intervalSec', [45, 60, 75, 90, 120]);
        return (
          <>
            <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Base interval</h1>
            <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">
              {choices.style === 'asymmetric' ? `Bilateral slot length. Combined will be +30s.` : `Every slot will be this long.`}
            </p>
            <GroupHeader>Seconds per slot</GroupHeader>
            <Group>
              {options.map(s => (
                <Row key={s} onClick={() => set('intervalSec', s)} subtitle={choices.style === 'asymmetric' ? `Bilateral ${s}s · Combined ${s + 30}s` : null}>
                  {s} seconds
                </Row>
              ))}
            </Group>
            {options.length === 0 && <GroupFooter>No clean interval fits. Go back to adjust.</GroupFooter>}
          </>
        );
      })()}

      {stepName === 'composition' && (() => {
        const options = validFor('composition', ['bilateral', 'mixed', 'unilateral']);
        const labels = {
          bilateral: { title: 'All bilateral', sub: 'Compounds only (squat, bench, deadlift).' },
          mixed: { title: 'Bilateral + unilateral', sub: 'Compounds plus single-side accessory work.' },
          unilateral: { title: 'All unilateral', sub: 'Every exercise is single-side. Lower-body focus.' },
        };
        return (
          <>
            <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Composition</h1>
            <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">What kind of session?</p>
            <GroupHeader>Choose one</GroupHeader>
            <Group>
              {options.map(opt => <Row key={opt} onClick={() => set('composition', opt)} subtitle={labels[opt].sub}>{labels[opt].title}</Row>)}
            </Group>
          </>
        );
      })()}

      {stepName === 'results' && (
        <>
          <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">
            {filtered.length} {filtered.length === 1 ? 'session' : 'sessions'} match
          </h1>
          <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">
            {choices.duration} min · {choices.style === 'asymmetric' ? 'asymmetric' : 'uniform'} · {choices.intervalSec}s base
          </p>
          {filtered.length === 0 ? (
            <GroupFooter>No matches. Go back and loosen one of your choices.</GroupFooter>
          ) : (
            <>
              <GroupHeader>Pick a session</GroupHeader>
              <Group>
                {filtered.map(c => {
                  const isAsym = c.style === 'asymmetric';
                  return (
                    <Row key={c.id} onClick={() => onPickConfig(c)}
                      subtitle={`${c.totalEx} ex · ${c.sets} sets each · ${fmtTime(c.cycleSec)} cycle · ${describeMix(c.bilateral, c.unilateral, isAsym)}`}>
                      {c.totalEx} × {c.sets}{isAsym ? ' (combined)' : ''}
                    </Row>
                  );
                })}
              </Group>
            </>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// SAVE-AS DIALOG
// =============================================================================
function SaveDialog({ open, defaultName, onClose, onSave }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(defaultName || ''); }, [open, defaultName]);
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Save session" primaryLabel="Save" onPrimary={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}>
      <GroupHeader>Name</GroupHeader>
      <Group>
        <div className="px-4 py-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder="e.g. Front squat + bench day"
            className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
          />
        </div>
      </Group>
      <GroupFooter>Saved sessions stay on this device.</GroupFooter>
    </Sheet>
  );
}

// =============================================================================
// CONFIGURE (preset)
// =============================================================================
function BlockRow({ block, idx, total, onMoveUp, onMoveDown, onRename, onToggleType }) {
  const isU = block.type === 'U';
  const isA = block.type === 'A';
  const typeText = isU ? 'Per-side unilateral' : isA ? 'Alternating L/R' : 'Bilateral';
  const typeColor = isU ? 'text-[var(--color-accent)]' : isA ? 'text-[var(--color-alt)]' : 'text-[var(--color-secondary)]';
  return (
    <div className="sep-row flex items-center min-h-[60px] px-4 py-2.5 gap-3">
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={block.name}
          onChange={e => onRename(e.target.value)}
          onFocus={e => e.target.select()}
          placeholder={`Exercise ${idx + 1}`}
          className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
        />
        <button type="button" onClick={isU ? undefined : onToggleType} disabled={isU}
          className={`mt-0.5 text-[13px] ${typeColor} ${!isU && 'underline-offset-2 hover:underline'}`}>
          {typeText}
        </button>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={idx === 0}
          className="press w-7 h-7 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center" aria-label="Move up">
          <ChevronLeft size={14} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
          className="press w-7 h-7 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center" aria-label="Move down">
          <ChevronLeft size={14} strokeWidth={2.5} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </div>
  );
}

function ConfigureView({ config, blocks, setBlocks, onBack, onStart, onSave }) {
  const isAsym = config.style === 'asymmetric';
  const moveBlock = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    setBlocks(next);
  };
  const updateName = (idx, name) => { const next = [...blocks]; next[idx] = { ...next[idx], name }; setBlocks(next); };
  const toggleType = (idx) => { const next = [...blocks]; if (next[idx].type === 'U') return; next[idx] = { ...next[idx], type: next[idx].type === 'B' ? 'A' : 'B' }; setBlocks(next); };

  return (
    <div className="slideIn pb-8">
      <NavBar title="Set up" leftLabel="New" onLeft={onBack} rightLabel="Start" onRight={onStart} />

      <GroupHeader>Session</GroupHeader>
      <Group>
        <div className="px-4 py-3 flex items-stretch divide-x divide-[var(--color-sep)]">
          <div className="flex-1 pr-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Duration</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{config.duration}<span className="text-[13px] text-[var(--color-secondary)] font-normal ml-0.5">min</span></div>
          </div>
          <div className="flex-1 px-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Interval</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">
              {isAsym ? `${config.intervalSec}+${config.extendedSec}` : config.intervalSec}<span className="text-[13px] text-[var(--color-secondary)] font-normal ml-0.5">s</span>
            </div>
          </div>
          <div className="flex-1 pl-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Total sets</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{config.totalSets}</div>
          </div>
        </div>
      </Group>
      <GroupFooter>{config.sets} rounds · {fmtTime(config.cycleSec)} cycle · {describeMix(config.bilateral, config.unilateral, isAsym)}</GroupFooter>

      <GroupHeader>Exercises</GroupHeader>
      <Group>
        {blocks.map((block, idx) => (
          <BlockRow key={block.id} block={block} idx={idx} total={blocks.length}
            onMoveUp={() => moveBlock(idx, -1)}
            onMoveDown={() => moveBlock(idx, 1)}
            onRename={(name) => updateName(idx, name)}
            onToggleType={() => toggleType(idx)} />
        ))}
      </Group>
      <GroupFooter>Tap exercise type to flip bilateral ↔ alternating. Tap and start typing to rename.</GroupFooter>

      <GroupHeader>Library</GroupHeader>
      <Group>
        <Row onClick={onSave} leading={<Bookmark size={18} strokeWidth={2.2} className="text-[var(--color-accent)]" />}>
          Save to library
        </Row>
      </Group>
    </div>
  );
}

// =============================================================================
// CUSTOM BUILDER
// =============================================================================
function newExercise(n = 1) { return { id: uid(), name: `Exercise ${n}`, duration: 60, mode: 'standard' }; }
function newCircuit(startN = 1) { return { id: uid(), rounds: 4, restAfterSec: 180, exercises: [newExercise(startN), newExercise(startN + 1)] }; }
function emptyCustom() { return { circuits: [{ ...newCircuit(1), restAfterSec: 0 }] }; }

function CustomExerciseRow({ exercise, idx, totalInCircuit, onChange, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="sep-row flex items-center min-h-[64px] px-4 py-2.5 gap-2">
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={exercise.name}
          onChange={e => onChange({ ...exercise, name: e.target.value })}
          onFocus={e => e.target.select()}
          placeholder="Exercise name"
          className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-2">
          <Stepper value={exercise.duration} min={5} max={600} step={5} onChange={d => onChange({ ...exercise, duration: d })} />
          <button type="button"
            onClick={() => onChange({ ...exercise, mode: exercise.mode === 'unilateral' ? 'standard' : 'unilateral' })}
            className={`press rounded-md px-2 py-1.5 text-[12px] font-medium ${
              exercise.mode === 'unilateral'
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'bg-[var(--color-cell-pressed)] text-[var(--color-secondary)]'
            }`}>
            {exercise.mode === 'unilateral' ? 'Unilateral' : 'Standard'}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={idx === 0}
          className="press w-7 h-6 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center">
          <ChevronLeft size={12} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={idx === totalInCircuit - 1}
          className="press w-7 h-6 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center">
          <ChevronLeft size={12} strokeWidth={2.5} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
      <button type="button" onClick={onDelete} className="press w-7 h-7 rounded-md text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0 ml-1" aria-label="Delete">
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function CustomBuilderView({ session, setSession, onBack, onStart, onSave }) {
  const updateCircuit = (ci, patch) => {
    setSession(s => ({ ...s, circuits: s.circuits.map((c, i) => i === ci ? { ...c, ...patch } : c) }));
  };
  const updateExercise = (ci, ei, next) => {
    updateCircuit(ci, { exercises: session.circuits[ci].exercises.map((e, i) => i === ei ? next : e) });
  };
  const addExercise = (ci) => {
    const n = session.circuits.reduce((acc, c) => acc + c.exercises.length, 0) + 1;
    updateCircuit(ci, { exercises: [...session.circuits[ci].exercises, newExercise(n)] });
  };
  const deleteExercise = (ci, ei) => {
    if (session.circuits[ci].exercises.length === 1) return;
    updateCircuit(ci, { exercises: session.circuits[ci].exercises.filter((_, i) => i !== ei) });
  };
  const moveExercise = (ci, ei, dir) => {
    const list = [...session.circuits[ci].exercises];
    const j = ei + dir;
    if (j < 0 || j >= list.length) return;
    [list[ei], list[j]] = [list[j], list[ei]];
    updateCircuit(ci, { exercises: list });
  };
  const addCircuit = () => {
    const n = session.circuits.reduce((acc, c) => acc + c.exercises.length, 0) + 1;
    setSession(s => ({ ...s, circuits: [...s.circuits, newCircuit(n)] }));
  };
  const deleteCircuit = (ci) => {
    if (session.circuits.length === 1) return;
    setSession(s => ({ ...s, circuits: s.circuits.filter((_, i) => i !== ci) }));
  };

  const built = buildCustomSession(session);
  const totalEx = session.circuits.reduce((acc, c) => acc + c.exercises.length, 0);
  const canStart = totalEx > 0 && session.circuits.every(c => c.exercises.length > 0 && c.exercises.every(e => e.duration > 0));

  return (
    <div className="slideIn pb-8">
      <NavBar title="Custom" leftLabel="New" onLeft={onBack} rightLabel="Start" onRight={canStart ? onStart : undefined} rightDisabled={!canStart} />

      <GroupHeader>Summary</GroupHeader>
      <Group>
        <div className="px-4 py-3 flex items-stretch divide-x divide-[var(--color-sep)]">
          <div className="flex-1 pr-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Total time</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">~{built.durationMin}<span className="text-[13px] text-[var(--color-secondary)] font-normal ml-0.5">min</span></div>
          </div>
          <div className="flex-1 px-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Total sets</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{built.totalSets}</div>
          </div>
          <div className="flex-1 pl-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Circuits</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{session.circuits.length}</div>
          </div>
        </div>
      </Group>

      {session.circuits.map((circuit, ci) => (
        <React.Fragment key={circuit.id}>
          <div className="px-4 mt-6 mb-1.5 flex items-baseline justify-between">
            <div className="text-[13px] uppercase tracking-wide text-[var(--color-secondary)]">Circuit {ci + 1}</div>
            {session.circuits.length > 1 && (
              <button type="button" onClick={() => deleteCircuit(ci)} className="press text-[13px] text-red-400 -mr-1 px-1">Delete</button>
            )}
          </div>
          <Group>
            {circuit.exercises.map((ex, ei) => (
              <CustomExerciseRow
                key={ex.id}
                exercise={ex}
                idx={ei}
                totalInCircuit={circuit.exercises.length}
                onChange={(next) => updateExercise(ci, ei, next)}
                onDelete={() => deleteExercise(ci, ei)}
                onMoveUp={() => moveExercise(ci, ei, -1)}
                onMoveDown={() => moveExercise(ci, ei, 1)}
              />
            ))}
            <Row onClick={() => addExercise(ci)} leading={<Plus size={18} strokeWidth={2.4} className="text-[var(--color-accent)]" />}>
              <span className="text-[var(--color-accent)]">Add exercise</span>
            </Row>
          </Group>

          <Group className="mt-2">
            <div className="sep-row flex items-center justify-between px-4 py-2.5 min-h-[44px]">
              <div className="text-[15px]">Rounds</div>
              <div className="inline-flex items-center gap-1 bg-[var(--color-cell-pressed)] rounded-lg px-1 py-1">
                <button type="button" onClick={() => updateCircuit(ci, { rounds: Math.max(1, circuit.rounds - 1) })} disabled={circuit.rounds <= 1}
                  className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"><Minus size={15} strokeWidth={2.5} /></button>
                <div className="tabular text-[15px] font-semibold min-w-[28px] text-center">{circuit.rounds}</div>
                <button type="button" onClick={() => updateCircuit(ci, { rounds: Math.min(30, circuit.rounds + 1) })} disabled={circuit.rounds >= 30}
                  className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"><Plus size={15} strokeWidth={2.5} /></button>
              </div>
            </div>
            {ci < session.circuits.length - 1 && (
              <div className="sep-row flex items-center justify-between px-4 py-2.5 min-h-[44px]">
                <div className="text-[15px]">Rest after</div>
                <Stepper value={circuit.restAfterSec} min={0} max={600} step={15} onChange={v => updateCircuit(ci, { restAfterSec: v })} />
              </div>
            )}
          </Group>
        </React.Fragment>
      ))}

      <div className="px-4 mt-6">
        <button type="button" onClick={addCircuit}
          className="press w-full h-12 rounded-xl bg-[var(--color-cell)] text-[15px] font-medium text-[var(--color-accent)] inline-flex items-center justify-center gap-2">
          <Plus size={16} strokeWidth={2.5} />
          Add circuit
        </button>
      </div>

      <GroupHeader>Library</GroupHeader>
      <Group>
        <Row onClick={onSave} leading={<Bookmark size={18} strokeWidth={2.2} className="text-[var(--color-accent)]" />}>
          Save to library
        </Row>
      </Group>
    </div>
  );
}

// =============================================================================
// LIBRARY VIEW
// =============================================================================
function LibraryView({ items, onClose, onLoad, onDelete }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="slideIn pb-8">
      <NavBar
        title="Saved"
        leftLabel="Done"
        onLeft={onClose}
        rightLabel={items.length > 0 ? (editing ? 'Done' : 'Edit') : null}
        onRight={items.length > 0 ? () => setEditing(v => !v) : null}
      />

      {items.length === 0 ? (
        <div className="px-4 mt-12 text-center">
          <Bookmark size={32} strokeWidth={2} className="mx-auto text-[var(--color-tertiary)]" />
          <div className="text-[17px] font-semibold mt-4">Nothing saved yet</div>
          <div className="text-[14px] text-[var(--color-secondary)] mt-1">When you build a session you like, tap Save to find it again here.</div>
        </div>
      ) : (
        <>
          <GroupHeader>{items.length} session{items.length > 1 ? 's' : ''}</GroupHeader>
          <Group>
            {items.map(item => {
              let sub = '';
              if (item.sourceType === 'preset') {
                const cfg = CONFIG_BY_ID[item.configId];
                if (cfg) {
                  const isAsym = cfg.style === 'asymmetric';
                  sub = `${cfg.duration} min · ${isAsym ? `${cfg.intervalSec}+${cfg.extendedSec}s` : `${cfg.intervalSec}s`} · ${cfg.totalEx} ex · ${cfg.sets} sets each`;
                } else {
                  sub = 'Preset config (unavailable)';
                }
              } else {
                const built = buildCustomSession(item.custom);
                sub = `Custom · ${built.durationMin} min · ${built.totalSets} sets · ${item.custom.circuits.length} circuit${item.custom.circuits.length > 1 ? 's' : ''}`;
              }
              return (
                <Row
                  key={item.id}
                  onClick={editing ? undefined : () => onLoad(item)}
                  subtitle={sub}
                  trailing={editing ? (
                    <button type="button" onClick={() => onDelete(item.id)} className="press w-8 h-8 rounded-md text-red-400 hover:bg-red-500/10 flex items-center justify-center">
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  ) : null}
                >
                  {item.name}
                </Row>
              );
            })}
          </Group>
        </>
      )}
    </div>
  );
}

// =============================================================================
// TIMER
// =============================================================================
function ProgressRing({ progress, color, size = 260, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - progress * c;
  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset 0.95s linear' }} />
    </svg>
  );
}

function TimerView({ session, onBack }) {
  const slots = session.slots;
  const totalSlots = slots.length;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => slots[0]?.duration ?? 60);
  const [running, setRunning] = useState(false);
  const [preCount, setPreCount] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  const prevIdxRef = useRef(0);
  const midRef = useRef(false);

  const isComplete = currentIdx >= totalSlots;
  const currentSlot = !isComplete ? slots[currentIdx] : null;
  const nextSlot = currentIdx + 1 < totalSlots ? slots[currentIdx + 1] : null;

  // working set indexes for the "X of Y sets" badge (skip rests)
  const workingSetIdx = !isComplete ? slots.slice(0, currentIdx + 1).filter(s => !s.isRest).length : session.totalSets;
  const workingSetTotal = session.totalSets;

  useEffect(() => {
    if (preCount === null) return;
    if (preCount === 0) {
      const t = setTimeout(() => {
        setPreCount(null);
        setRunning(true);
        if (audioOn) cues.go();
      }, 600);
      return () => clearTimeout(t);
    }
    if (audioOn) cues.preTick(preCount);
    const t = setTimeout(() => setPreCount(preCount - 1), 1000);
    return () => clearTimeout(t);
  }, [preCount, audioOn]);

  useEffect(() => {
    if (!running) return;
    if (currentIdx >= totalSlots) { setRunning(false); return; }
    const slot = slots[currentIdx];
    const half = slot.combined ? Math.ceil(slot.duration / 2) : null;
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev > 1) {
          if (prev === 4 && audioOn) cues.warning3sec();
          if (slot.combined && !midRef.current && prev === half && audioOn) {
            cues.halfway();
            midRef.current = true;
          }
          return prev - 1;
        }
        const newIdx = currentIdx + 1;
        setCurrentIdx(newIdx);
        midRef.current = false;
        if (newIdx >= totalSlots) return 0;
        return slots[newIdx].duration;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running, currentIdx, totalSlots, slots, audioOn]);

  useEffect(() => {
    if (currentIdx === prevIdxRef.current) return;
    const slot = slots[currentIdx];
    if (currentIdx > 0 && currentIdx < totalSlots && audioOn) {
      if (slot?.isRest) cues.enterRest();
      else cues.transition();
    }
    if (currentIdx >= totalSlots && audioOn) cues.complete();
    prevIdxRef.current = currentIdx;
  }, [currentIdx, totalSlots, audioOn, slots]);

  useEffect(() => {
    let lock = null;
    let cancelled = false;
    if (running && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(l => { if (!cancelled) lock = l; }).catch(() => {});
    }
    return () => { cancelled = true; if (lock) lock.release().catch(() => {}); };
  }, [running]);

  const start = () => {
    if (isComplete) { setCurrentIdx(0); setSecondsLeft(slots[0].duration); prevIdxRef.current = 0; midRef.current = false; }
    setPreCount(3);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false); setPreCount(null); setCurrentIdx(0); setSecondsLeft(slots[0].duration); prevIdxRef.current = 0; midRef.current = false;
  };
  const skip = () => {
    if (isComplete) return;
    const j = currentIdx + 1;
    setCurrentIdx(j); midRef.current = false;
    if (j >= totalSlots) setSecondsLeft(0);
    else setSecondsLeft(slots[j].duration);
  };

  const showPre = preCount !== null;
  const hasStarted = currentIdx > 0 || running;
  const slotDur = currentSlot?.duration ?? 60;
  const slotProgress = currentSlot ? 1 - secondsLeft / slotDur : 0;
  const ringColor = currentSlot?.isRest
    ? 'rgb(120, 144, 200)'
    : currentSlot?.combined
    ? 'rgb(255, 121, 198)'
    : currentSlot?.alternating
    ? 'rgb(94, 234, 212)'
    : 'rgb(255, 214, 10)';
  const sessionProgress = currentIdx / totalSlots;

  // round indicator
  const roundLine = currentSlot?.isRest
    ? 'Rest between circuits'
    : currentSlot?.meta?.circuit
    ? `Circuit ${currentSlot.meta.circuit}/${currentSlot.meta.totalCircuits} · Round ${currentSlot.meta.round}/${currentSlot.meta.totalRoundsInCircuit}`
    : currentSlot?.meta?.round
    ? `Round ${currentSlot.meta.round}/${currentSlot.meta.totalRounds}`
    : '';

  return (
    <div className="slideIn pb-8">
      <NavBar title={session.type === 'custom' ? 'Custom' : 'Workout'} leftLabel="Setup" onLeft={onBack} />

      <div className="px-4 mt-1">
        <div className="h-[2px] rounded-full bg-[var(--color-cell)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sessionProgress * 100}%`, background: ringColor }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12px] text-[var(--color-secondary)] tabular">
          <span className="truncate">{roundLine}</span>
          <span className="ml-2 shrink-0"><span className="text-white font-medium">{workingSetIdx}</span>/{workingSetTotal} sets</span>
        </div>
      </div>

      {showPre && (
        <div className="flex flex-col items-center justify-center mt-16 fadeIn">
          <div className="text-[13px] text-[var(--color-secondary)] mb-3">Get ready</div>
          <div className="tabular text-[140px] font-bold leading-none" style={{ color: ringColor, letterSpacing: '-0.04em' }}>
            {preCount === 0 ? 'GO' : preCount}
          </div>
        </div>
      )}

      {isComplete && !showPre && (
        <div className="flex flex-col items-center justify-center mt-14 fadeIn px-4 text-center">
          <Check size={48} strokeWidth={2.5} style={{ color: ringColor }} className="mb-4" />
          <div className="text-[26px] font-bold tracking-tight">Session complete</div>
          <div className="text-[15px] text-[var(--color-secondary)] mt-1 tabular">{workingSetTotal} sets · {session.durationMin} minutes</div>
        </div>
      )}

      {!showPre && !isComplete && currentSlot && (
        <>
          <div className="relative mx-auto mt-7" style={{ width: 260, height: 260 }}>
            <ProgressRing progress={slotProgress} color={ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="tabular font-bold leading-none" style={{ color: ringColor, fontSize: 96, letterSpacing: '-0.04em' }}>
                {secondsLeft}
              </div>
            </div>
          </div>

          <div className="text-center mt-7 px-4">
            <div className="text-[22px] font-semibold tracking-tight">{currentSlot.name}</div>
            <div className="mt-1 text-[14px] text-[var(--color-secondary)]">
              {currentSlot.isRest && 'Recover'}
              {currentSlot.side === 'L' && 'Left side'}
              {currentSlot.side === 'R' && 'Right side'}
              {currentSlot.alternating && 'Alternating L/R within the interval'}
              {currentSlot.combined && 'Combined L + R · switch at halfway'}
              {currentSlot.unilateral && !currentSlot.combined && 'Unilateral'}
              {!currentSlot.side && !currentSlot.alternating && !currentSlot.combined && !currentSlot.unilateral && !currentSlot.isRest && 'Both sides'}
            </div>
          </div>

          {nextSlot && (
            <>
              <GroupHeader>Up next</GroupHeader>
              <Group>
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-[17px]">{nextSlot.name}</div>
                  <div className="text-[13px] text-[var(--color-secondary)]">
                    {nextSlot.isRest ? `rest · ${nextSlot.duration}s`
                      : nextSlot.combined ? `L+R · ${nextSlot.duration}s`
                      : nextSlot.alternating ? `alt · ${nextSlot.duration}s`
                      : nextSlot.side ? `${nextSlot.side} · ${nextSlot.duration}s`
                      : nextSlot.unilateral ? `uni · ${nextSlot.duration}s`
                      : `${nextSlot.duration}s`}
                  </div>
                </div>
              </Group>
            </>
          )}
        </>
      )}

      <div className="px-4 mt-7 space-y-2">
        {!running && !isComplete && (
          <button type="button" onClick={hasStarted ? resume : start}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}>
            <Play size={18} strokeWidth={2.5} fill="currentColor" />
            {hasStarted ? 'Resume' : 'Start'}
          </button>
        )}
        {running && (
          <button type="button" onClick={pause}
            className="press w-full h-14 rounded-2xl bg-[var(--color-cell)] text-[17px] font-semibold inline-flex items-center justify-center gap-2">
            <Pause size={18} strokeWidth={2.5} fill="currentColor" />
            Pause
          </button>
        )}
        {isComplete && (
          <button type="button" onClick={start}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}>
            <Play size={18} strokeWidth={2.5} fill="currentColor" />
            Run again
          </button>
        )}
        {hasStarted && !isComplete && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={skip}
              className="press h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2">
              <SkipForward size={15} strokeWidth={2.5} />
              Skip
            </button>
            <button type="button" onClick={reset}
              className="press h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2">
              <RotateCcw size={15} strokeWidth={2.5} />
              Reset
            </button>
          </div>
        )}
      </div>

      <div className="px-4 mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[15px] text-[var(--color-secondary)]">
          {audioOn ? <Volume2 size={16} strokeWidth={2.2} /> : <VolumeX size={16} strokeWidth={2.2} />}
          Audio cues
        </div>
        <button type="button" onClick={() => setAudioOn(v => !v)}
          role="switch" aria-checked={audioOn}
          className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
          style={{ background: audioOn ? ringColor : 'var(--color-cell)' }}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${audioOn ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================
export default function App() {
  const [view, setView] = useState('wizard');
  const [mode, setMode] = useState(null); // 'preset' | 'custom'
  const [presetConfig, setPresetConfig] = useState(null);
  const [presetBlocks, setPresetBlocks] = useState([]);
  const [customSession, setCustomSession] = useState(null);
  const [library, setLibrary] = useState(() => loadLibrary());
  const [saveOpen, setSaveOpen] = useState(false);

  const persist = (next) => { setLibrary(next); persistLibrary(next); };

  const pickPreset = (config) => {
    setMode('preset');
    setCustomSession(null);
    setPresetConfig(config);
    setPresetBlocks(makeBlocks(config.bilateral, config.unilateral));
    setView('configure');
  };
  const pickCustom = () => {
    setMode('custom');
    setPresetConfig(null);
    setPresetBlocks([]);
    setCustomSession(emptyCustom());
    setView('customBuilder');
  };
  const openLibrary = () => setView('library');
  const closeLibrary = () => setView('wizard');

  const loadFromLibrary = (item) => {
    if (item.sourceType === 'preset') {
      const cfg = CONFIG_BY_ID[item.configId];
      if (!cfg) return;
      setMode('preset');
      setCustomSession(null);
      setPresetConfig(cfg);
      setPresetBlocks(item.blocks.map(b => ({ ...b, id: uid() })));
      setView('configure');
    } else {
      setMode('custom');
      setPresetConfig(null);
      setPresetBlocks([]);
      setCustomSession(JSON.parse(JSON.stringify(item.custom)));
      setView('customBuilder');
    }
  };
  const deleteFromLibrary = (id) => persist(library.filter(i => i.id !== id));

  const saveCurrent = (name) => {
    let item;
    if (mode === 'preset' && presetConfig) {
      item = {
        id: uid(), savedAt: Date.now(), name,
        sourceType: 'preset',
        configId: presetConfig.id,
        blocks: presetBlocks.map(b => ({ type: b.type, name: b.name })),
      };
    } else if (mode === 'custom' && customSession) {
      item = {
        id: uid(), savedAt: Date.now(), name,
        sourceType: 'custom',
        custom: JSON.parse(JSON.stringify(customSession)),
      };
    }
    if (item) persist([item, ...library]);
  };

  const defaultName = mode === 'preset' && presetConfig
    ? `${presetConfig.duration}m · ${presetConfig.totalEx} ex × ${presetConfig.sets}`
    : mode === 'custom' && customSession
    ? customSession.circuits[0]?.exercises?.[0]?.name || 'Custom session'
    : '';

  const session = useMemo(() => {
    if (view === 'timer') {
      if (mode === 'preset' && presetConfig && presetBlocks?.length) return buildPresetSession(presetConfig, presetBlocks);
      if (mode === 'custom' && customSession) return buildCustomSession(customSession);
    }
    return null;
  }, [view, mode, presetConfig, presetBlocks, customSession]);

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-[440px] mx-auto">
        {view === 'wizard' && (
          <Wizard onPickConfig={pickPreset} onPickCustom={pickCustom} onOpenLibrary={openLibrary} libraryCount={library.length} />
        )}
        {view === 'library' && (
          <LibraryView items={library} onClose={closeLibrary} onLoad={loadFromLibrary} onDelete={deleteFromLibrary} />
        )}
        {view === 'configure' && presetConfig && (
          <ConfigureView
            config={presetConfig}
            blocks={presetBlocks}
            setBlocks={setPresetBlocks}
            onBack={() => setView('wizard')}
            onStart={() => setView('timer')}
            onSave={() => setSaveOpen(true)}
          />
        )}
        {view === 'customBuilder' && customSession && (
          <CustomBuilderView
            session={customSession}
            setSession={setCustomSession}
            onBack={() => setView('wizard')}
            onStart={() => setView('timer')}
            onSave={() => setSaveOpen(true)}
          />
        )}
        {view === 'timer' && session && (
          <TimerView
            session={session}
            onBack={() => setView(mode === 'custom' ? 'customBuilder' : 'configure')}
          />
        )}
        <SaveDialog open={saveOpen} defaultName={defaultName} onClose={() => setSaveOpen(false)} onSave={saveCurrent} />
      </div>
    </div>
  );
}
