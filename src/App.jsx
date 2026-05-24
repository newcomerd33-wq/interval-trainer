import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronRight, ChevronLeft, Check, Play, Pause, RotateCcw, SkipForward,
  Volume2, VolumeX,
} from 'lucide-react';

// =============================================================================
// DATA
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
    bilateral: b, unilateral: u,
    totalEx: b + u,
    slots,
    cycleSec: slots * intervalSec,
    totalSets: (b + u) * sets,
  }))
);

function asymConfigs() {
  const out = [];
  const durations = [15, 20, 30, 45, 60];
  const bases = [45, 60, 75, 90, 120];
  let idx = 0;
  for (const d of durations) {
    const totalSec = d * 60;
    for (const intervalSec of bases) {
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

const CONFIGS = [...UNIFORM_CONFIGS, ...asymConfigs()];

// =============================================================================
// HELPERS
// =============================================================================
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function describeMix(b, u, isAsym) {
  const parts = [];
  if (b > 0) parts.push(`${b} bilateral`);
  if (u > 0) parts.push(`${u} ${isAsym ? 'combined' : 'unilateral'}`);
  return parts.join(', ');
}

function makeBlocks(b, u) {
  const blocks = [];
  let n = 1;
  for (let i = 0; i < b; i++) blocks.push({ id: `b${i}-${Math.random()}`, type: 'B', name: `Exercise ${n++}` });
  for (let i = 0; i < u; i++) blocks.push({ id: `u${i}-${Math.random()}`, type: 'U', name: `Exercise ${n++}` });
  return blocks;
}

function expandSlots(blocks, config) {
  const isAsym = config?.style === 'asymmetric';
  const base = config?.intervalSec ?? null;
  const ext = config?.extendedSec ?? null;
  const out = [];
  for (const block of blocks) {
    if (block.type === 'B') {
      out.push({ name: block.name, side: null, duration: base });
    } else if (block.type === 'A') {
      out.push({ name: block.name, side: null, alternating: true, duration: base });
    } else if (isAsym) {
      out.push({ name: block.name, side: null, combined: true, duration: ext });
    } else {
      out.push({ name: block.name, side: 'L', duration: base });
      out.push({ name: block.name, side: 'R', duration: base });
    }
  }
  return out;
}

// =============================================================================
// AUDIO — only workout cues, no UI clicks
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
  env.gain.linearRampToValueAtTime(gain, now + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, now + ampDecay);

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

function tone({ freq = 1800, decay = 0.06, gain = 0.4, delay = 0 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.001);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + decay + 0.02);
}

const cues = {
  preTick(n) {
    const f = { 3: 660, 2: 784, 1: 932 }[n] ?? 660;
    bell({ carrier: f, modRatio: 2, modAmount: 200, modDecay: 0.12, ampDecay: 0.25, gain: 0.55 });
  },
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
  complete() {
    bell({ carrier: 1568, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.52, delay: 0 });
    bell({ carrier: 1318, modRatio: 2, modAmount: 500, modDecay: 0.3, ampDecay: 0.9, gain: 0.52, delay: 0.18 });
    bell({ carrier: 1047, modRatio: 2, modAmount: 500, modDecay: 0.35, ampDecay: 1.1, gain: 0.6, delay: 0.36 });
  },
};

// =============================================================================
// PRIMITIVES — iOS Settings-style grouped lists
// =============================================================================
function NavBar({ title, leftLabel, onLeft, rightLabel, onRight, rightDisabled }) {
  return (
    <div className="h-11 flex items-center px-4 relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {onLeft && (
          <button
            type="button"
            onClick={onLeft}
            className="press inline-flex items-center text-[17px] text-[var(--color-accent)] h-11 -my-2 pl-1 pr-2"
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="-ml-1" />
            <span>{leftLabel || 'Back'}</span>
          </button>
        )}
      </div>
      <div className="flex-1 text-center text-[17px] font-semibold truncate">{title}</div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {onRight && (
          <button
            type="button"
            onClick={onRight}
            disabled={rightDisabled}
            className="press text-[17px] text-[var(--color-accent)] disabled:opacity-30 px-1 h-11 -my-2"
          >
            {rightLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function GroupHeader({ children }) {
  return (
    <div className="px-4 mt-6 mb-1.5 text-[13px] uppercase tracking-wide text-[var(--color-secondary)]">
      {children}
    </div>
  );
}

function GroupFooter({ children }) {
  return (
    <div className="px-4 mt-1.5 text-[13px] text-[var(--color-secondary)] leading-snug">
      {children}
    </div>
  );
}

function Group({ children }) {
  return (
    <div className="mx-4 rounded-xl bg-[var(--color-cell)] overflow-hidden">
      {children}
    </div>
  );
}

function Row({ children, onClick, selected, disabled, trailing, subtitle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`sep-row press w-full text-left flex items-center min-h-[44px] px-4 py-2.5 ${
        disabled ? 'opacity-40' : 'active:bg-[var(--color-cell-pressed)]'
      } ${className}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[17px] text-white">{children}</div>
        {subtitle && <div className="text-[13px] text-[var(--color-secondary)] mt-0.5">{subtitle}</div>}
      </div>
      <div className="ml-3 flex items-center gap-1 text-[var(--color-tertiary)] shrink-0">
        {trailing}
        {selected && <Check size={18} strokeWidth={2.5} className="text-[var(--color-accent)]" />}
        {onClick && !selected && <ChevronRight size={16} strokeWidth={2} />}
      </div>
    </button>
  );
}

// =============================================================================
// WIZARD
// =============================================================================
const WIZARD_STEPS = ['duration', 'style', 'interval', 'composition', 'results'];

function Wizard({ onPickConfig }) {
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState({
    duration: null, style: null, intervalSec: null, composition: null,
  });

  const set = (key, value) => {
    setChoices(c => ({ ...c, [key]: value }));
    setStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };
  const back = () => setStep(s => Math.max(s - 1, 0));
  const restart = () => { setChoices({ duration: null, style: null, intervalSec: null, composition: null }); setStep(0); };

  // Filter the candidate pool progressively based on choices
  const filtered = useMemo(() => CONFIGS.filter(c => {
    if (choices.duration && c.duration !== choices.duration) return false;
    if (choices.style && c.style !== choices.style) return false;
    if (choices.intervalSec && c.intervalSec !== choices.intervalSec) return false;
    if (choices.composition === 'bilateral' && c.unilateral > 0) return false;
    if (choices.composition === 'mixed' && (c.unilateral === 0 || c.bilateral === 0)) return false;
    if (choices.composition === 'unilateral' && c.bilateral > 0) return false;
    return true;
  }), [choices]);

  // What options are still valid at the current step
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
        rightLabel={step > 0 ? 'Restart' : null}
        onRight={step > 0 ? restart : null}
      />

      <div className="px-4 mt-1 mb-2 flex items-center gap-1.5">
        {WIZARD_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-cell)]'}`}
          />
        ))}
      </div>

      {stepName === 'duration' && (
        <>
          <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">How long?</h1>
          <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">Total session length, including all work intervals.</p>
          <GroupHeader>Duration</GroupHeader>
          <Group>
            {[15, 20, 30, 45, 60].map(d => (
              <Row key={d} onClick={() => set('duration', d)}>{d} minutes</Row>
            ))}
          </Group>
        </>
      )}

      {stepName === 'style' && (
        <>
          <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Interval style</h1>
          <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">All slots the same length, or extra time on combined unilateral?</p>
          <GroupHeader>Choose one</GroupHeader>
          <Group>
            <Row
              onClick={() => set('style', 'uniform')}
              subtitle="Every slot the same length. Unilateral work splits across two slots (L then R)."
            >
              Uniform
            </Row>
            <Row
              onClick={() => set('style', 'asymmetric')}
              subtitle="Bilateral on base interval. Unilateral fits both sides in one extended interval (base + 30s)."
            >
              Asymmetric
            </Row>
          </Group>
        </>
      )}

      {stepName === 'interval' && (() => {
        const options = validFor('intervalSec', [45, 60, 75, 90, 120]);
        return (
          <>
            <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Base interval</h1>
            <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">
              {choices.style === 'asymmetric'
                ? `Bilateral slot length. Combined unilateral will be +30s.`
                : `Every slot will be this long.`}
            </p>
            <GroupHeader>Seconds per slot</GroupHeader>
            <Group>
              {options.map(s => (
                <Row
                  key={s}
                  onClick={() => set('intervalSec', s)}
                  subtitle={choices.style === 'asymmetric' ? `Bilateral ${s}s · Combined ${s + 30}s` : null}
                >
                  {s} seconds
                </Row>
              ))}
            </Group>
            {options.length === 0 && (
              <GroupFooter>No clean interval fits this duration with the chosen style. Tap Back to adjust.</GroupFooter>
            )}
          </>
        );
      })()}

      {stepName === 'composition' && (() => {
        const options = validFor('composition', ['bilateral', 'mixed', 'unilateral']);
        const labels = {
          bilateral: { title: 'All bilateral', sub: 'Standard compounds only (e.g. squat, bench, deadlift).' },
          mixed: { title: 'Bilateral + unilateral', sub: 'Compound lifts plus single-side accessory work.' },
          unilateral: { title: 'All unilateral', sub: 'Every exercise is single-side. Lower-body focus.' },
        };
        return (
          <>
            <h1 className="px-4 mt-4 text-[28px] font-bold tracking-tight leading-tight">Composition</h1>
            <p className="px-4 mt-1 text-[15px] text-[var(--color-secondary)]">What kind of session do you want to run?</p>
            <GroupHeader>Choose one</GroupHeader>
            <Group>
              {options.map(opt => (
                <Row key={opt} onClick={() => set('composition', opt)} subtitle={labels[opt].sub}>
                  {labels[opt].title}
                </Row>
              ))}
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
                    <Row
                      key={c.id}
                      onClick={() => onPickConfig(c)}
                      subtitle={`${c.totalEx} ex · ${c.sets} sets each · ${fmtTime(c.cycleSec)} cycle · ${describeMix(c.bilateral, c.unilateral, isAsym)}`}
                    >
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
// CONFIGURE
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
          placeholder={`Exercise ${idx + 1}`}
          className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={isU ? undefined : onToggleType}
          disabled={isU}
          className={`mt-0.5 text-[13px] ${typeColor} ${!isU && 'underline-offset-2 hover:underline'}`}
        >
          {typeText}
        </button>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={idx === 0}
          className="press w-7 h-7 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center"
          aria-label="Move up"
        >
          <ChevronLeft size={14} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="press w-7 h-7 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center"
          aria-label="Move down"
        >
          <ChevronLeft size={14} strokeWidth={2.5} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </div>
  );
}

function ConfigureView({ config, blocks, setBlocks, onBack, onStart }) {
  const isAsym = config.style === 'asymmetric';

  const moveBlock = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
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

  const slots = expandSlots(blocks, config);

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
      <GroupFooter>
        {config.sets} rounds · {fmtTime(config.cycleSec)} cycle · {describeMix(config.bilateral, config.unilateral, isAsym)}
      </GroupFooter>

      <GroupHeader>Exercises</GroupHeader>
      <Group>
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
      </Group>
      <GroupFooter>Tap exercise type to flip bilateral ↔ alternating. Unilateral exercises occupy {isAsym ? 'one extended slot.' : 'two slots (L then R).'}</GroupFooter>

      <GroupHeader>Round sequence</GroupHeader>
      <Group>
        <div className="px-4 py-3 flex flex-wrap gap-1.5">
          {slots.map((s, i) => {
            const cls = s.combined
              ? 'text-[var(--color-asym)] bg-[var(--color-asym)]/12'
              : s.alternating
              ? 'text-[var(--color-alt)] bg-[var(--color-alt)]/12'
              : s.side
              ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/12'
              : 'text-white bg-white/8';
            const suffix = s.combined ? '· L+R' : s.alternating ? '· alt' : s.side || '';
            return (
              <span key={i} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] ${cls}`}>
                <span className="truncate max-w-[140px]">{s.name}</span>
                {suffix && <span className="opacity-70">{suffix}</span>}
              </span>
            );
          })}
        </div>
      </Group>
      <GroupFooter>Sequence repeats {config.sets} times.</GroupFooter>
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
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset 0.95s linear' }}
      />
    </svg>
  );
}

function TimerView({ config, blocks, onBack }) {
  const slots = useMemo(() => expandSlots(blocks, config), [blocks, config]);
  const totalSlots = slots.length * config.sets;
  const isAsym = config.style === 'asymmetric';

  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => slots[0]?.duration ?? config.intervalSec);
  const [running, setRunning] = useState(false);
  const [preCount, setPreCount] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  const prevIdxRef = useRef(0);
  const midRef = useRef(false);

  const isComplete = currentIdx >= totalSlots;
  const currentSlot = !isComplete ? slots[currentIdx % slots.length] : null;
  const nextSlot = currentIdx + 1 < totalSlots ? slots[(currentIdx + 1) % slots.length] : null;
  const currentSet = isComplete ? config.sets : Math.floor(currentIdx / slots.length) + 1;

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
    const slot = slots[currentIdx % slots.length];
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
        return slots[newIdx % slots.length].duration;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running, currentIdx, totalSlots, slots, audioOn]);

  useEffect(() => {
    if (currentIdx === prevIdxRef.current) return;
    if (currentIdx > 0 && currentIdx < totalSlots && audioOn) cues.transition();
    if (currentIdx >= totalSlots && audioOn) cues.complete();
    prevIdxRef.current = currentIdx;
  }, [currentIdx, totalSlots, audioOn]);

  useEffect(() => {
    let lock = null;
    let cancelled = false;
    if (running && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(l => { if (!cancelled) lock = l; }).catch(() => {});
    }
    return () => { cancelled = true; if (lock) lock.release().catch(() => {}); };
  }, [running]);

  const start = () => {
    if (isComplete) {
      setCurrentIdx(0);
      setSecondsLeft(slots[0].duration);
      prevIdxRef.current = 0;
      midRef.current = false;
    }
    setPreCount(3);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setPreCount(null);
    setCurrentIdx(0);
    setSecondsLeft(slots[0].duration);
    prevIdxRef.current = 0;
    midRef.current = false;
  };
  const skip = () => {
    if (isComplete) return;
    const j = currentIdx + 1;
    setCurrentIdx(j);
    midRef.current = false;
    if (j >= totalSlots) setSecondsLeft(0);
    else setSecondsLeft(slots[j % slots.length].duration);
  };

  const showPre = preCount !== null;
  const hasStarted = currentIdx > 0 || running;
  const slotDur = currentSlot?.duration ?? config.intervalSec;
  const slotProgress = currentSlot ? 1 - secondsLeft / slotDur : 0;
  const ringColor = currentSlot?.combined
    ? 'rgb(255, 121, 198)'
    : currentSlot?.alternating
    ? 'rgb(94, 234, 212)'
    : 'rgb(255, 214, 10)';
  const sessionProgress = currentIdx / totalSlots;

  return (
    <div className="slideIn pb-8">
      <NavBar title="Workout" leftLabel="Setup" onLeft={onBack} />

      <div className="px-4 mt-1">
        <div className="h-[2px] rounded-full bg-[var(--color-cell)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sessionProgress * 100}%`, background: ringColor }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12px] text-[var(--color-secondary)] tabular">
          <span>Round <span className="text-white font-medium">{currentSet}</span>/{config.sets}</span>
          <span><span className="text-white font-medium">{currentIdx}</span>/{totalSlots} sets</span>
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
          <div className="text-[15px] text-[var(--color-secondary)] mt-1 tabular">{config.totalSets} sets · {config.duration} minutes</div>
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
              {currentSlot.side === 'L' && 'Left side'}
              {currentSlot.side === 'R' && 'Right side'}
              {currentSlot.alternating && 'Alternating L/R within the interval'}
              {currentSlot.combined && `Combined L + R · switch at halfway`}
              {!currentSlot.side && !currentSlot.alternating && !currentSlot.combined && `Both sides`}
            </div>
          </div>

          {nextSlot && (
            <>
              <GroupHeader>Up next</GroupHeader>
              <Group>
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-[17px]">{nextSlot.name}</div>
                  <div className="text-[13px] text-[var(--color-secondary)]">
                    {nextSlot.combined ? `L+R · ${nextSlot.duration}s` : nextSlot.alternating ? 'alt L/R' : nextSlot.side ? nextSlot.side : `${nextSlot.duration}s`}
                  </div>
                </div>
              </Group>
            </>
          )}
        </>
      )}

      <div className="px-4 mt-7 space-y-2">
        {!running && !isComplete && (
          <button
            type="button"
            onClick={hasStarted ? resume : start}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}
          >
            <Play size={18} strokeWidth={2.5} fill="currentColor" />
            {hasStarted ? 'Resume' : 'Start'}
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={pause}
            className="press w-full h-14 rounded-2xl bg-[var(--color-cell)] text-[17px] font-semibold inline-flex items-center justify-center gap-2"
          >
            <Pause size={18} strokeWidth={2.5} fill="currentColor" />
            Pause
          </button>
        )}
        {isComplete && (
          <button
            type="button"
            onClick={start}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}
          >
            <Play size={18} strokeWidth={2.5} fill="currentColor" />
            Run again
          </button>
        )}
        {hasStarted && !isComplete && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={skip}
              className="press h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2"
            >
              <SkipForward size={15} strokeWidth={2.5} />
              Skip
            </button>
            <button
              type="button"
              onClick={reset}
              className="press h-12 rounded-2xl bg-[var(--color-cell)] text-[15px] font-medium inline-flex items-center justify-center gap-2"
            >
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
        <button
          type="button"
          onClick={() => setAudioOn(v => !v)}
          role="switch"
          aria-checked={audioOn}
          className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
          style={{ background: audioOn ? ringColor : 'var(--color-cell)' }}
        >
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
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [blocks, setBlocks] = useState([]);

  const handlePick = (config) => {
    setSelectedConfig(config);
    setBlocks(makeBlocks(config.bilateral, config.unilateral));
    setView('configure');
  };

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-[440px] mx-auto">
        {view === 'wizard' && <Wizard onPickConfig={handlePick} />}
        {view === 'configure' && (
          <ConfigureView
            config={selectedConfig}
            blocks={blocks}
            setBlocks={setBlocks}
            onBack={() => setView('wizard')}
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
