import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// =============================================================================
// DATA: All 99 valid configurations
// =============================================================================
const TEMPLATES = [
  [15, 75, 2, 6], [15, 75, 3, 4], [15, 75, 4, 3], [15, 90, 2, 5],
  [20, 75, 2, 8], [20, 75, 4, 4], [20, 120, 2, 5],
  [30, 75, 2, 12], [30, 75, 3, 8], [30, 75, 4, 6], [30, 75, 6, 4], [30, 75, 8, 3],
  [30, 90, 2, 10], [30, 90, 4, 5], [30, 90, 5, 4],
  [30, 120, 3, 5], [30, 120, 5, 3],
  [45, 75, 3, 12], [45, 75, 4, 9], [45, 75, 6, 6],
  [45, 90, 2, 15], [45, 90, 3, 10], [45, 90, 5, 6], [45, 90, 6, 5],
  [60, 75, 4, 12], [60, 75, 6, 8], [60, 75, 8, 6],
  [60, 90, 4, 10], [60, 90, 5, 8], [60, 90, 8, 5],
  [60, 120, 2, 15], [60, 120, 3, 10], [60, 120, 5, 6], [60, 120, 6, 5],
];

function generateMixes(slots) {
  const mixes = [];
  for (let u = 0; u <= Math.floor(slots / 2); u++) {
    mixes.push({ b: slots - 2 * u, u });
  }
  return mixes;
}

const CONFIGS = TEMPLATES.flatMap(([duration, intervalSec, slots, sets], tIdx) =>
  generateMixes(slots).map(({ b, u }, mIdx) => ({
    id: `${String(tIdx).padStart(2, '0')}${mIdx}`,
    duration, intervalSec, slots, sets,
    bilateral: b, unilateral: u,
    totalEx: b + u,
    cycleSec: slots * intervalSec,
    totalIntervals: slots * sets,
  }))
);

// =============================================================================
// HELPERS
// =============================================================================
function formatCycle(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function describeMix(b, u) {
  if (b === 0 && u === 0) return '';
  if (b === 0) return `${u} unilateral`;
  if (u === 0) return `${b} bilateral`;
  return `${b} bilateral + ${u} unilateral`;
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

function expandBlocksToSlots(blocks) {
  const slots = [];
  for (const block of blocks) {
    if (block.type === 'B') {
      slots.push({ name: block.name, side: null });
    } else {
      slots.push({ name: block.name, side: 'Left' });
      slots.push({ name: block.name, side: 'Right' });
    }
  }
  return slots;
}

// =============================================================================
// AUDIO (single shared context, beeps on demand)
// =============================================================================
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _audioCtx = new AC();
  }
  return _audioCtx;
}
function playBeep(frequency = 800, duration = 0.15, gain = 0.3) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* silent */ }
}

// =============================================================================
// UI PRIMITIVES
// =============================================================================
function PillButton({ active, onClick, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
        disabled ? 'opacity-30 cursor-not-allowed border-zinc-800 text-zinc-600' :
        active
          ? 'bg-amber-400 text-zinc-950 border-amber-400'
          : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="font-mono text-lg text-zinc-100">{value}</div>
    </div>
  );
}

function SlotStrip({ blocks }) {
  const slots = blocks.flatMap(block =>
    block.type === 'B' ? [{ t: 'B' }] : [{ t: 'L' }, { t: 'R' }]
  );
  return (
    <div className="flex gap-0.5 flex-wrap">
      {slots.map((slot, idx) => (
        <div
          key={idx}
          className={`w-7 h-7 flex items-center justify-center font-mono text-[10px] font-bold ${
            slot.t === 'B'
              ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
              : 'bg-amber-950 text-amber-300 border border-amber-800'
          }`}
        >
          {slot.t}
        </div>
      ))}
    </div>
  );
}

function BackButton({ onClick, label = 'Back' }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-amber-400 transition-colors mb-4"
    >
      ← {label}
    </button>
  );
}

// =============================================================================
// BROWSE VIEW
// =============================================================================
function ConfigCard({ config, onSelect }) {
  const { id, duration, intervalSec, slots, sets, bilateral, unilateral, totalEx, cycleSec, totalIntervals } = config;
  const previewBlocks = useMemo(() => generateInitialBlocks(bilateral, unilateral), [bilateral, unilateral]);

  return (
    <button
      onClick={() => onSelect(config)}
      className="w-full text-left border border-zinc-800 hover:border-amber-400/60 transition-colors bg-zinc-900/40 group"
    >
      <div className="flex items-baseline justify-between px-4 py-3 border-b border-zinc-800/60">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">CFG-{id}</span>
          <span className="font-mono text-sm text-amber-400">{duration} min · {intervalSec}s</span>
        </div>
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
          {totalEx} {totalEx === 1 ? 'exercise' : 'exercises'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 py-4 border-b border-zinc-800/60">
        <Metric label="Format" value={`${slots} × ${sets}`} />
        <Metric label="Cycle time" value={formatCycle(cycleSec)} />
        <Metric label="Total sets" value={totalIntervals} />
      </div>
      <div className="px-4 py-4 flex items-end justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Composition</div>
          <div className="text-sm text-zinc-200 mb-3">{describeMix(bilateral, unilateral)}</div>
          <SlotStrip blocks={previewBlocks} />
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 group-hover:text-amber-400 transition-colors whitespace-nowrap">
          Select →
        </div>
      </div>
    </button>
  );
}

function BrowseView({ onSelectConfig }) {
  const [duration, setDuration] = useState('all');
  const [intervalSec, setIntervalSec] = useState('all');
  const [exCount, setExCount] = useState('any');
  const [uniFilter, setUniFilter] = useState('any');
  const [minSets, setMinSets] = useState(3);

  const filtered = useMemo(() => CONFIGS.filter(c => {
    if (duration !== 'all' && c.duration !== duration) return false;
    if (intervalSec !== 'all' && c.intervalSec !== intervalSec) return false;
    if (exCount !== 'any' && c.totalEx !== exCount) return false;
    if (c.sets < minSets) return false;
    if (uniFilter === 'none' && c.unilateral > 0) return false;
    if (uniFilter === 'some' && c.unilateral === 0) return false;
    if (uniFilter === 'pure' && c.bilateral > 0) return false;
    return true;
  }), [duration, intervalSec, exCount, minSets, uniFilter]);

  const resetFilters = () => {
    setDuration('all'); setIntervalSec('all'); setExCount('any');
    setUniFilter('any'); setMinSets(3);
  };

  return (
    <>
      <div className="border-b border-zinc-800 pb-6 mb-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-2">
          Athletic Potential · Programming Tool
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
          Interval Configuration Explorer
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-xl leading-relaxed">
          All 99 valid interval-based lifting structures across 15, 20, 30, 45, and 60-minute sessions.
          Tap a config to configure and start a timed workout.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <FilterGroup label="Duration">
          <PillButton active={duration === 'all'} onClick={() => setDuration('all')}>All</PillButton>
          {[15, 20, 30, 45, 60].map(d => (
            <PillButton key={d} active={duration === d} onClick={() => setDuration(d)}>{d} min</PillButton>
          ))}
        </FilterGroup>
        <FilterGroup label="Interval">
          <PillButton active={intervalSec === 'all'} onClick={() => setIntervalSec('all')}>All</PillButton>
          {[75, 90, 120].map(i => (
            <PillButton key={i} active={intervalSec === i} onClick={() => setIntervalSec(i)}>{i}s</PillButton>
          ))}
        </FilterGroup>
        <FilterGroup label="Total exercises">
          <PillButton active={exCount === 'any'} onClick={() => setExCount('any')}>Any</PillButton>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
            <PillButton key={n} active={exCount === n} onClick={() => setExCount(n)}>{n}</PillButton>
          ))}
        </FilterGroup>
        <FilterGroup label="Unilateral content">
          <PillButton active={uniFilter === 'any'} onClick={() => setUniFilter('any')}>Any</PillButton>
          <PillButton active={uniFilter === 'none'} onClick={() => setUniFilter('none')}>All bilateral</PillButton>
          <PillButton active={uniFilter === 'some'} onClick={() => setUniFilter('some')}>Has unilateral</PillButton>
          <PillButton active={uniFilter === 'pure'} onClick={() => setUniFilter('pure')}>All unilateral</PillButton>
        </FilterGroup>
        <FilterGroup label={`Minimum sets per exercise: ${minSets}`}>
          <input
            type="range" min="3" max="15" value={minSets}
            onChange={e => setMinSets(parseInt(e.target.value))}
            className="w-full accent-amber-400"
          />
        </FilterGroup>
        <div className="pt-2">
          <button
            onClick={resetFilters}
            className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-amber-400 transition-colors"
          >
            [ Reset filters ]
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Showing</div>
        <div className="font-mono">
          <span className="text-2xl text-amber-400 font-bold">{filtered.length}</span>
          <span className="text-sm text-zinc-500 ml-2">/ {CONFIGS.length}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 font-mono text-sm border border-zinc-800 border-dashed">
          No configurations match these filters
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => <ConfigCard key={c.id} config={c} onSelect={onSelectConfig} />)}
        </div>
      )}
    </>
  );
}

// =============================================================================
// CONFIGURE VIEW
// =============================================================================
function BlockEditor({ block, idx, total, onMoveUp, onMoveDown, onRename }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
      <div className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border ${
        block.type === 'B'
          ? 'text-zinc-300 border-zinc-700 bg-zinc-800'
          : 'text-amber-300 border-amber-800 bg-amber-950'
      }`}>
        {block.type === 'B' ? 'Bilateral' : 'Unilateral'}
      </div>
      <input
        type="text"
        value={block.name}
        onChange={e => onRename(e.target.value)}
        className="flex-1 bg-transparent text-zinc-100 border-b border-zinc-800 focus:border-amber-400 focus:outline-none py-1 text-sm"
        placeholder={`Exercise ${idx + 1}`}
      />
      <div className="flex flex-col gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="w-7 h-5 flex items-center justify-center border border-zinc-800 text-zinc-400 hover:border-amber-400 hover:text-amber-400 disabled:opacity-20 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400 transition-colors text-xs"
        >▲</button>
        <button
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="w-7 h-5 flex items-center justify-center border border-zinc-800 text-zinc-400 hover:border-amber-400 hover:text-amber-400 disabled:opacity-20 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400 transition-colors text-xs"
        >▼</button>
      </div>
    </div>
  );
}

function ConfigureView({ config, blocks, setBlocks, onBack, onStart }) {
  const moveBlock = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[idx]];
    setBlocks(newBlocks);
  };
  const updateName = (idx, name) => {
    const newBlocks = [...blocks];
    newBlocks[idx] = { ...newBlocks[idx], name };
    setBlocks(newBlocks);
  };
  const previewSlots = expandBlocksToSlots(blocks);

  return (
    <>
      <BackButton onClick={onBack} label="Back to browse" />
      <div className="border-b border-zinc-800 pb-6 mb-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-2">
          Configure Session · CFG-{config.id}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          {config.duration} min · {config.intervalSec}s · {config.slots} × {config.sets}
        </h1>
        <div className="text-sm text-zinc-400 mt-2">
          {describeMix(config.bilateral, config.unilateral)} · cycle {formatCycle(config.cycleSec)} · {config.totalIntervals} total sets
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
          Round order · rename & reorder
        </div>
        <div className="space-y-2">
          {blocks.map((block, idx) => (
            <BlockEditor
              key={block.id}
              block={block}
              idx={idx}
              total={blocks.length}
              onMoveUp={() => moveBlock(idx, -1)}
              onMoveDown={() => moveBlock(idx, 1)}
              onRename={(name) => updateName(idx, name)}
            />
          ))}
        </div>
      </div>

      <div className="mb-8 border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          Round sequence preview
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {previewSlots.map((slot, idx) => (
            <div key={idx} className={`px-2 py-1 text-xs font-mono border ${
              slot.side
                ? 'border-amber-800 bg-amber-950 text-amber-300'
                : 'border-zinc-700 bg-zinc-800 text-zinc-200'
            }`}>
              {slot.name}{slot.side ? ` (${slot.side[0]})` : ''}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          This sequence repeats {config.sets} times.
        </div>
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold uppercase tracking-widest text-sm transition-colors"
      >
        Start Workout →
      </button>
    </>
  );
}

// =============================================================================
// TIMER VIEW
// =============================================================================
function TimerView({ config, blocks, onBack }) {
  const slots = useMemo(() => expandBlocksToSlots(blocks), [blocks]);
  const totalSlots = slots.length * config.sets;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(config.intervalSec);
  const [running, setRunning] = useState(false);
  const [preCount, setPreCount] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  const prevIdxRef = useRef(0);

  const isComplete = currentIdx >= totalSlots;
  const currentSlot = !isComplete ? slots[currentIdx % slots.length] : null;
  const nextSlot = currentIdx + 1 < totalSlots ? slots[(currentIdx + 1) % slots.length] : null;
  const currentSet = isComplete ? config.sets : Math.floor(currentIdx / slots.length) + 1;
  const slotInRound = isComplete ? slots.length : (currentIdx % slots.length) + 1;

  // Pre-countdown
  useEffect(() => {
    if (preCount === null) return;
    if (preCount === 0) {
      const t = setTimeout(() => {
        setPreCount(null);
        setRunning(true);
        if (audioOn) playBeep(880, 0.4, 0.4);
      }, 500);
      return () => clearTimeout(t);
    }
    if (audioOn) playBeep(440, 0.12);
    const t = setTimeout(() => setPreCount(preCount - 1), 1000);
    return () => clearTimeout(t);
  }, [preCount, audioOn]);

  // Main tick
  useEffect(() => {
    if (!running) return;
    if (currentIdx >= totalSlots) {
      setRunning(false);
      return;
    }
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev > 1) {
          if (prev === 4 && audioOn) playBeep(660, 0.08, 0.2);
          return prev - 1;
        }
        setCurrentIdx(i => i + 1);
        return config.intervalSec;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running, currentIdx, totalSlots, config.intervalSec, audioOn]);

  // Beep on transition
  useEffect(() => {
    if (currentIdx === prevIdxRef.current) return;
    if (currentIdx > 0 && currentIdx < totalSlots && audioOn) {
      playBeep(880, 0.2, 0.4);
    }
    if (currentIdx >= totalSlots && audioOn) {
      playBeep(330, 0.6, 0.4);
      setTimeout(() => playBeep(440, 0.6, 0.4), 200);
    }
    prevIdxRef.current = currentIdx;
  }, [currentIdx, totalSlots, audioOn]);

  // Wake lock
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
      setSecondsLeft(config.intervalSec);
      prevIdxRef.current = 0;
    }
    setPreCount(3);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setPreCount(null);
    setCurrentIdx(0);
    setSecondsLeft(config.intervalSec);
    prevIdxRef.current = 0;
  };
  const skip = () => {
    if (isComplete) return;
    setCurrentIdx(i => i + 1);
    setSecondsLeft(config.intervalSec);
  };

  const progressPct = (currentIdx / totalSlots) * 100;
  const showTimer = preCount === null && !isComplete;
  const showPre = preCount !== null;
  const hasStarted = currentIdx > 0 || running;

  return (
    <>
      <BackButton onClick={onBack} label="Back to configure" />

      <div className="mb-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">
          Live Session · CFG-{config.id}
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          {config.duration} min · {config.intervalSec}s · {config.slots}×{config.sets}
        </div>
      </div>

      {showPre && (
        <div className="flex flex-col items-center justify-center py-16 mb-6 border border-amber-400/40 bg-amber-400/5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-4">
            Get Ready
          </div>
          <div className="text-9xl font-bold text-amber-400 font-mono">
            {preCount === 0 ? 'GO' : preCount}
          </div>
        </div>
      )}

      {isComplete && (
        <div className="flex flex-col items-center justify-center py-16 mb-6 border border-amber-400/40 bg-amber-400/5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-2">
            Session Complete
          </div>
          <div className="text-3xl font-bold text-zinc-100 mb-1">Done.</div>
          <div className="text-sm text-zinc-400 font-mono">
            {totalSlots} sets · {config.duration} minutes
          </div>
        </div>
      )}

      {showTimer && (
        <>
          <div className="border border-zinc-800 bg-zinc-900/40 p-6 mb-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Now</div>
            <div className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-1 leading-tight break-words">
              {currentSlot.name}
            </div>
            {currentSlot.side && (
              <div className="text-xl font-mono text-amber-400 uppercase tracking-wider mt-1">
                {currentSlot.side} side
              </div>
            )}
            <div className="mt-6 flex items-baseline gap-3">
              <div className="text-7xl sm:text-8xl font-mono font-bold text-amber-400 tabular-nums">
                {secondsLeft}
              </div>
              <div className="text-sm font-mono uppercase tracking-widest text-zinc-500">sec</div>
            </div>
          </div>

          {nextSlot && (
            <div className="border border-zinc-800 bg-zinc-900/20 p-4 mb-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Next</div>
              <div className="text-lg text-zinc-300">
                {nextSlot.name}{nextSlot.side && <span className="text-amber-400/80 ml-2">({nextSlot.side})</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Set</div>
              <div className="font-mono text-lg text-zinc-100">{currentSet} / {config.sets}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Slot in round</div>
              <div className="font-mono text-lg text-zinc-100">{slotInRound} / {slots.length}</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
              Session progress · {currentIdx} / {totalSlots} sets
            </div>
            <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </>
      )}

      {!showPre && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {!running && !isComplete && (
            <button
              onClick={hasStarted ? resume : start}
              className="col-span-2 py-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold uppercase tracking-widest text-sm transition-colors"
            >
              {hasStarted ? 'Resume' : 'Start Workout'}
            </button>
          )}
          {running && (
            <button
              onClick={pause}
              className="col-span-2 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold uppercase tracking-widest text-sm transition-colors border border-zinc-700"
            >
              Pause
            </button>
          )}
          {isComplete && (
            <button
              onClick={start}
              className="col-span-2 py-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold uppercase tracking-widest text-sm transition-colors"
            >
              Run Again
            </button>
          )}
          {!isComplete && hasStarted && (
            <>
              <button
                onClick={skip}
                className="py-3 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-100 font-mono uppercase tracking-widest text-xs transition-colors"
              >
                Skip ▶
              </button>
              <button
                onClick={reset}
                className="py-3 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-100 font-mono uppercase tracking-widest text-xs transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={audioOn}
            onChange={e => setAudioOn(e.target.checked)}
            className="accent-amber-400"
          />
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Audio cues</span>
        </label>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          screen stays awake while running
        </div>
      </div>
    </>
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 pb-12">
      <div className="max-w-2xl mx-auto">
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
