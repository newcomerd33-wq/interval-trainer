import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronRight, ChevronLeft, ChevronDown, Check, Play, Pause, RotateCcw, SkipForward,
  Volume2, VolumeX, Plus, Minus, X, Sliders, Bookmark, Trash2, Repeat, ClipboardList,
  Folder, FolderPlus, FolderOpen, FolderInput, Pencil,
} from 'lucide-react';
import { NavBar, Group, GroupHeader, GroupFooter, Row, CenterCard, ConfirmDeleteDialog, Sheet } from './views/ui.jsx';
import { TabBar } from './views/TabBar.jsx';
import { HistoryView } from './views/HistoryView.jsx';
import { LogEditorView } from './views/LogEditorView.jsx';
import { DataBackup } from './views/DataBackup.jsx';
import { ReviewLog } from './views/ReviewLog.jsx';
import { CalendarView } from './views/CalendarView.jsx';
import { TodayStrip } from './views/TodayStrip.jsx';
import { addRule, removeRule, addOneOff, removeOneOff, setOneOffStatus, addException, occurrencesInRange, scheduledDoneKeys } from './schedule.js';
import { loadLibrary, saveLibrary, loadFolders, saveFolders, loadJournal, saveJournal, loadExercises, saveExercises, loadSchedule, saveSchedule, buildBackup, loadActiveLog, saveActiveLog, clearActiveLog } from './storage.js';
import { addFolder, renameFolder, removeFolder, moveItemToFolder, unfileItems, groupLibraryByFolder } from './folders.js';
import { exercisesForItem, expandSetsFromSlots } from './exercises.js';
import { ensureExercise, findExercise, normalizeExerciseName, METRIC_KINDS, METRIC_LABEL, METRIC_LABEL_SHORT, DEFAULT_METRIC_KIND } from './catalog.js';
import { createEntry, seedExercisesForLog, upsertEntry, removeEntry, withUpdatedAt, suggestionsForExercise, recentSessionsForExercise, lastExerciseLogged, emptySet, emptyExercise, fieldsForMetric, pruneEntry, hasLoggedContent, isLoggedSet, cascadeField, isSetComplete, formatSetGroups, coerceSet, ALL_SET_FIELDS, SET_TEXT_FIELDS } from './journal.js';
import { todayKey, addDays } from './date.js';

// Boxing bell samples (Vite resolves these to hashed URLs at build time)
import goSampleUrl from './assets/sounds/go.mp3?url';
import endSampleUrl from './assets/sounds/end.mp3?url';
import completeSampleUrl from './assets/sounds/complete.mp3?url';

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
        // Intra-circuit rest: a recovery slot between exercises, repeated each
        // round. isRest makes it non-recording everywhere (logger/counter/audio).
        if (isRestItem(ex)) {
          slots.push({
            name: 'Rest',
            duration: ex.duration,
            isRest: true,
            meta: { circuit: ci + 1, totalCircuits: custom.circuits.length, round: r, totalRoundsInCircuit: circuit.rounds, isRest: true },
          });
          totalDurationSec += ex.duration;
          continue;
        }
        slots.push({
          name: ex.name,
          duration: ex.duration,
          unilateral: ex.mode === 'unilateral',
          metricKind: ex.metricKind || DEFAULT_METRIC_KIND,
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

// Primary + accessories rotation.
// A "sequence" pairs the primary with each accessory once: P-A1-P-A2-...-P-AN
// (2 × accessoryCount slots). The user picks how many sequence rounds to do.
// Example: 3 accessories, 5 rounds = 30 slots; primary gets 15 sets, each accessory gets 5.
function emptyRotation() {
  return {
    rounds: 5,
    intervalSec: 60,
    primary: { id: uid(), name: 'Primary exercise', mode: 'standard' },
    accessories: [
      { id: uid(), name: 'Accessory 1', mode: 'standard' },
      { id: uid(), name: 'Accessory 2', mode: 'standard' },
    ],
  };
}

function buildRotationSession(rot) {
  const accN = rot.accessories.length;
  const slotsPerSequence = 2 * accN;
  const totalSlots = rot.rounds * slotsPerSequence;
  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    const seqIdx = Math.floor(i / slotsPerSequence) + 1;
    if (i % 2 === 0) {
      slots.push({
        name: rot.primary.name,
        duration: rot.intervalSec,
        unilateral: rot.primary.mode === 'unilateral',
        meta: { round: seqIdx, totalRounds: rot.rounds, isPrimary: true },
      });
    } else {
      const accIdx = Math.floor(i / 2) % accN;
      const acc = rot.accessories[accIdx];
      slots.push({
        name: acc.name,
        duration: rot.intervalSec,
        unilateral: acc.mode === 'unilateral',
        meta: { round: seqIdx, totalRounds: rot.rounds, isAccessory: true, accessoryIdx: accIdx },
      });
    }
  }
  const totalDurationSec = totalSlots * rot.intervalSec;
  return {
    type: 'rotation',
    slots,
    totalSets: totalSlots,
    totalDurationSec,
    durationMin: Math.round(totalDurationSec / 60),
    metaLine: `${Math.round(totalDurationSec / 60)} min · ${rot.intervalSec}s · primary + ${accN} accessor${accN === 1 ? 'y' : 'ies'}`,
  };
}

// Library/journal/catalog persistence lives in ./storage.js (single source of
// truth for localStorage keys + the unified backup shape).

// =============================================================================
// AUDIO
// =============================================================================
let _ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _ctx = new AC();
    if (_ctx) ensureSamplesLoaded();
    // Audio Session API: 'transient' tells iOS to briefly duck other audio (e.g. Spotify)
    // while our cues play. Supported in Safari 16.4+ and Chromium 116+ behind a flag.
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'transient') {
        navigator.audioSession.type = 'transient';
      }
    } catch {}
  }
  if (_ctx?.state === 'suspended') _ctx.resume();
  return _ctx;
}

// --- Sampled boxing bells ---
const _buffers = {};
let _bufferLoadStarted = false;
async function _decode(url, key) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    _buffers[key] = await ctx.decodeAudioData(arr);
  } catch (e) { /* sample unavailable; fall back to synth */ }
}
function ensureSamplesLoaded() {
  if (_bufferLoadStarted) return;
  _bufferLoadStarted = true;
  _decode(goSampleUrl, 'go');
  _decode(endSampleUrl, 'end');
  _decode(completeSampleUrl, 'complete');
}
function playSample(key, { gain = 1, delay = 0, rate = 1, maxDuration = null, fadeOut = 0 } = {}) {
  const ctx = getCtx();
  if (!ctx || !_buffers[key]) return false;
  const src = ctx.createBufferSource();
  src.buffer = _buffers[key];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g); g.connect(ctx.destination);
  const when = ctx.currentTime + delay;
  src.start(when);
  if (maxDuration != null) {
    if (fadeOut > 0) {
      const fadeStart = Math.max(when, when + maxDuration - fadeOut);
      g.gain.setValueAtTime(gain, fadeStart);
      g.gain.linearRampToValueAtTime(0.001, when + maxDuration);
    }
    src.stop(when + maxDuration);
  }
  return true;
}

// --- Sound primitives: percussive athletic palette ---

// Cached white-noise buffer
let _noiseBuf = null;
function noiseBuffer(ctx) {
  if (_noiseBuf && _noiseBuf.sampleRate === ctx.sampleRate) return _noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

// Filtered noise burst — snare-crack / hi-hat / woodblock texture depending on freq+Q
function crack({ freq = 2000, q = 4, decay = 0.08, gain = 0.4, attack = 0.001, type = 'bandpass', delay = 0 }) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  src.connect(filt); filt.connect(env); env.connect(ctx.destination);
  src.start(now); src.stop(now + decay + 0.05);
}

// Low-frequency thump — kick-drum body
function thump({ start = 140, end = 50, decay = 0.18, gain = 0.55, delay = 0 }) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.connect(env); env.connect(ctx.destination);
  osc.start(now); osc.stop(now + decay + 0.02);
}

// Clean tonal pulse — sine with very short attack
function blip({ freq = 1000, decay = 0.12, gain = 0.4, delay = 0, wave = 'sine' }) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, now + decay);
  osc.connect(env); env.connect(ctx.destination);
  osc.start(now); osc.stop(now + decay + 0.02);
}

// LOUD beep — flat-top square wave. Two oscillators layered (square + saw) for
// extra harmonic content. Soft-clipped through a waveshaper so the signal stays
// at perceived max volume without clipping artefacts.
let _shaper = null;
function getShaper() {
  const ctx = getCtx(); if (!ctx) return null;
  if (_shaper && _shaper.context === ctx) return _shaper;
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.5);
  }
  ws.curve = curve;
  ws.oversample = '4x';
  _shaper = ws;
  return ws;
}
function beep({ freq = 1000, duration = 0.18, gain = 0.85, delay = 0, cutoff = 2200 }) {
  const ctx = getCtx(); if (!ctx) return;
  const now = ctx.currentTime + delay;
  // Sine + small amount of square for body and harmonic interest, low-pass filtered
  // to kill the brittle high partials.
  const sine = ctx.createOscillator(); sine.type = 'sine'; sine.frequency.value = freq;
  const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = freq;
  const sineG = ctx.createGain(); sineG.gain.value = 0.85;
  const sqG = ctx.createGain(); sqG.gain.value = 0.3;
  sine.connect(sineG); sq.connect(sqG);
  const mix = ctx.createGain(); mix.gain.value = 1;
  sineG.connect(mix); sqG.connect(mix);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = cutoff;
  filt.Q.value = 0.7;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.006);
  env.gain.setValueAtTime(gain, now + duration - 0.04);
  env.gain.linearRampToValueAtTime(0, now + duration);
  mix.connect(filt); filt.connect(env); env.connect(ctx.destination);
  sine.start(now); sq.start(now);
  sine.stop(now + duration + 0.02); sq.stop(now + duration + 0.02);
}

const cues = {
  // 3-2-1 countdown beeps — warmer mid-range tone, loud but not piercing
  preTick(n) {
    beep({ freq: 740, duration: 0.18, gain: 0.9, cutoff: 2200 });
  },
  // Round start — boxing bell sample, pitched down slightly for warmth
  go() {
    if (!playSample('go', { gain: 1.4, rate: 0.9 })) {
      thump({ start: 160, end: 55, decay: 0.22, gain: 0.8 });
      beep({ freq: 880, duration: 0.4, gain: 1.0 });
    }
  },
  // 10s heads-up — single longer warm tone, lower than the countdown
  warning10sec() {
    beep({ freq: 440, duration: 0.55, gain: 0.9, cutoff: 1600 });
  },
  // Slot change — boxing bell sample at high gain, pitched down to match `go`
  transition() {
    if (!playSample('go', { gain: 1.4, rate: 0.9 })) {
      thump({ start: 160, end: 55, decay: 0.22, gain: 0.7 });
      beep({ freq: 880, duration: 0.35, gain: 0.95 });
    }
  },
  // Halfway switch — end-of-round bell sample, slightly distinct from `go`
  halfway() {
    if (!playSample('end', { gain: 0.95, rate: 1.0 })) {
      crack({ freq: 1600, q: 1.0, decay: 0.16, gain: 0.45 });
      blip({ freq: 880, decay: 0.22, gain: 0.4, delay: 0.02 });
      blip({ freq: 660, decay: 0.28, gain: 0.3, delay: 0.08 });
    }
  },
  // Entering rest — warm low pad, low intensity. Synth (samples would be too dramatic here).
  enterRest() {
    crack({ freq: 600, q: 0.8, decay: 0.3, gain: 0.35, type: 'lowpass' });
    blip({ freq: 330, decay: 0.4, gain: 0.3, delay: 0.02 });
  },
  // Session complete — boxing bell finale, pitched down + truncated to 2 dings
  // (file is 3 dings over ~3s; at rate 0.9 we stop at 2.1s wall-clock with a 0.2s fade).
  complete() {
    if (playSample('complete', { gain: 1.1, rate: 0.9, maxDuration: 2.1, fadeOut: 0.2 })) return;
    thump({ start: 140, end: 50, decay: 0.25, gain: 0.6 });
    crack({ freq: 3500, q: 1.2, decay: 0.15, gain: 0.5 });
    blip({ freq: 523, decay: 0.4, gain: 0.32 });
    blip({ freq: 659, decay: 0.4, gain: 0.32 });
    blip({ freq: 784, decay: 0.5, gain: 0.32 });
    // second hit
    thump({ start: 160, end: 60, decay: 0.3, gain: 0.65, delay: 0.3 });
    crack({ freq: 3500, q: 1.2, decay: 0.18, gain: 0.55, delay: 0.3 });
    blip({ freq: 523, decay: 0.5, gain: 0.32, delay: 0.3 });
    blip({ freq: 659, decay: 0.5, gain: 0.32, delay: 0.3 });
    blip({ freq: 988, decay: 0.6, gain: 0.36, delay: 0.3 });
  },
};

// =============================================================================
// PRIMITIVES
// =============================================================================
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

// =============================================================================
// WIZARD
// =============================================================================
const WIZARD_STEPS = ['duration', 'style', 'interval', 'composition', 'results'];

function Wizard({ onPickConfig, onPickCustom, onPickRotation }) {
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
        rightLabel={step === 0 ? null : 'Restart'}
        onRight={step === 0 ? null : restart}
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
            <Row onClick={onPickRotation} subtitle="One primary exercise alternates with accessory rotation (A-B-A-C-A-B...)." leading={<Repeat size={20} strokeWidth={2.2} className="text-[var(--color-accent)]" />}>
              Primary + accessories
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
  const inputRef = useRef(null);
  useEffect(() => { if (open) setName(defaultName || ''); }, [open, defaultName]);
  // Focus + scroll into view once mounted; redo after a delay so iOS keyboard animation finishes
  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    const t1 = setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'auto' }); }, 50);
    const t2 = setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);
  if (!open) return null;
  const submit = () => { if (name.trim()) { onSave(name.trim()); onClose(); } };
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
          maxWidth: 340,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 text-center">
          <div className="text-[17px] font-semibold">Save session</div>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Front squat + bench"
            className="mt-4 w-full bg-[var(--color-cell)] rounded-lg px-3 py-2.5 text-[15px] text-white text-center placeholder:text-[var(--color-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
          />
        </div>
        <div className="flex border-t border-white/10">
          <button type="button" onClick={onClose} className="press flex-1 h-11 text-[15px] text-[var(--color-accent)]">Cancel</button>
          <div className="w-px bg-white/10" />
          <button type="button" onClick={submit} disabled={!name.trim()} className="press flex-1 h-11 text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-30">Save</button>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// CONFIGURE (preset)
// =============================================================================
function StartWithDraftDialog({ open, onClose, onReview, onDiscardStart }) {
  return (
    <CenterCard open={open} onClose={onClose}>
      <div className="p-5 text-center">
        <div className="text-[17px] font-semibold">Unsaved workout</div>
        <div className="text-[13px] text-[var(--color-secondary)] mt-1">
          You have a logged workout that isn’t saved yet. Review it first, or discard it and start fresh.
        </div>
      </div>
      <div className="flex flex-col border-t border-white/10 divide-y divide-white/10">
        <button type="button" onClick={onReview} className="press h-11 text-[15px] text-[var(--color-accent)] font-semibold">Review unsaved</button>
        <button type="button" onClick={onDiscardStart} className="press h-11 text-[15px] text-red-400">Discard &amp; start</button>
        <button type="button" onClick={onClose} className="press h-11 text-[15px] text-[var(--color-secondary)]">Cancel</button>
      </div>
    </CenterCard>
  );
}

function LeaveTimerDialog({ open, onClose, onReview, onKeep, onDiscard }) {
  return (
    <CenterCard open={open} onClose={onClose}>
      <div className="p-5 text-center">
        <div className="text-[17px] font-semibold">Leave workout?</div>
        <div className="text-[13px] text-[var(--color-secondary)] mt-1">
          You have logged sets. Save them now, keep for later, or discard.
        </div>
      </div>
      <div className="flex flex-col border-t border-white/10 divide-y divide-white/10">
        <button type="button" onClick={onReview} className="press h-11 text-[15px] text-[var(--color-accent)] font-semibold">Review &amp; save</button>
        <button type="button" onClick={onKeep} className="press h-11 text-[15px] text-[var(--color-accent)]">Keep for later</button>
        <button type="button" onClick={onDiscard} className="press h-11 text-[15px] text-red-400">Discard</button>
      </div>
    </CenterCard>
  );
}

function SavePromptDialog({ open, originalName, onClose, onUpdate, onSaveAsNew }) {
  return (
    <CenterCard open={open} onClose={onClose}>
      <div className="p-5 text-center">
        <div className="text-[17px] font-semibold">Save changes</div>
        <div className="text-[13px] text-[var(--color-secondary)] mt-1">
          You loaded <span className="text-white">{originalName}</span>.
          Update it, or save as a new entry?
        </div>
      </div>
      <div className="flex flex-col border-t border-white/10 divide-y divide-white/10">
        <button type="button" onClick={onUpdate} className="press h-11 text-[15px] text-[var(--color-accent)] font-semibold">Update “{originalName}”</button>
        <button type="button" onClick={onSaveAsNew} className="press h-11 text-[15px] text-[var(--color-accent)]">Save as new</button>
        <button type="button" onClick={onClose} className="press h-11 text-[15px] text-[var(--color-secondary)]">Cancel</button>
      </div>
    </CenterCard>
  );
}

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
function newExercise(n = 1) { return { id: uid(), kind: 'exercise', name: `Exercise ${n}`, duration: 60, mode: 'standard', metricKind: DEFAULT_METRIC_KIND }; }
function newRest() { return { id: uid(), kind: 'rest', duration: 60 }; }
const isRestItem = (it) => it && it.kind === 'rest';
function newCircuit(startN = 1) { return { id: uid(), rounds: 4, restAfterSec: 180, exercises: [newExercise(startN), newExercise(startN + 1)] }; }
function emptyCustom() { return { circuits: [{ ...newCircuit(1), restAfterSec: 0 }] }; }

function MoveDeleteControls({ idx, total, onMoveUp, onMoveDown, onDelete }) {
  return (
    <>
      <div className="flex flex-col gap-1 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={idx === 0}
          className="press w-7 h-6 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center">
          <ChevronLeft size={12} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
          className="press w-7 h-6 rounded-md bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] disabled:opacity-25 flex items-center justify-center">
          <ChevronLeft size={12} strokeWidth={2.5} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
      <button type="button" onClick={onDelete} className="press w-7 h-7 rounded-md text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0 ml-1" aria-label="Delete">
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
    </>
  );
}

function CustomExerciseRow({ exercise, idx, totalInCircuit, onChange, onDelete, onMoveUp, onMoveDown }) {
  // Rest items carry no name/mode/recording — just a duration to recover.
  if (isRestItem(exercise)) {
    return (
      <div className="sep-row flex items-center min-h-[56px] px-4 py-2.5 gap-2 bg-[var(--color-cell-pressed)]/30">
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <div className="text-[15px] font-medium text-[var(--color-alt)] w-12 shrink-0">Rest</div>
          <Stepper value={exercise.duration} min={5} max={600} step={5} onChange={d => onChange({ ...exercise, duration: d })} />
          <span className="text-[12px] text-[var(--color-tertiary)]">no logging</span>
        </div>
        <MoveDeleteControls idx={idx} total={totalInCircuit} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
      </div>
    );
  }
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
        <div className="mt-1 flex items-center gap-2 flex-wrap">
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
          <select
            value={exercise.metricKind || DEFAULT_METRIC_KIND}
            onChange={e => onChange({ ...exercise, metricKind: e.target.value })}
            aria-label="Recording type"
            className="press rounded-md px-2 py-1.5 text-[12px] font-medium bg-[var(--color-cell-pressed)] text-[var(--color-secondary)] focus:outline-none"
          >
            {METRIC_KINDS.map(k => <option key={k} value={k}>{METRIC_LABEL_SHORT[k]}</option>)}
          </select>
        </div>
      </div>
      <MoveDeleteControls idx={idx} total={totalInCircuit} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
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
    // Number new exercises off the count of real exercises (ignore rests).
    const n = session.circuits.reduce((acc, c) => acc + c.exercises.filter((e) => !isRestItem(e)).length, 0) + 1;
    updateCircuit(ci, { exercises: [...session.circuits[ci].exercises, newExercise(n)] });
  };
  const addRest = (ci) => {
    updateCircuit(ci, { exercises: [...session.circuits[ci].exercises, newRest()] });
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
  // A session needs at least one real (non-rest) exercise; every item needs a
  // positive duration. Rest-only circuits are allowed as long as some circuit
  // has a real exercise.
  const realExCount = session.circuits.reduce((acc, c) => acc + c.exercises.filter((e) => !isRestItem(e)).length, 0);
  const canStart = realExCount > 0 && session.circuits.every(c => c.exercises.length > 0 && c.exercises.every(e => e.duration > 0));

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
            <div className="sep-row flex divide-x divide-[var(--color-sep)]">
              <button type="button" onClick={() => addExercise(ci)}
                className="press flex-1 flex items-center justify-center gap-1.5 h-11 text-[15px] text-[var(--color-accent)] active:bg-[var(--color-cell-pressed)]">
                <Plus size={16} strokeWidth={2.5} /> Add exercise
              </button>
              <button type="button" onClick={() => addRest(ci)}
                className="press flex-1 flex items-center justify-center gap-1.5 h-11 text-[15px] text-[var(--color-alt)] active:bg-[var(--color-cell-pressed)]">
                <Plus size={16} strokeWidth={2.5} /> Add rest
              </button>
            </div>
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
// ROTATION BUILDER (primary + accessories)
// =============================================================================
function isCleanRotation(durationMin, intervalSec) {
  const total = (durationMin * 60) / intervalSec;
  return Number.isInteger(total) && total % 2 === 0 && total >= 4;
}

function ChipPill({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`press inline-flex items-center rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${
        disabled
          ? 'bg-[var(--color-cell)] text-[var(--color-tertiary)] cursor-not-allowed'
          : active
          ? 'bg-[var(--color-accent)] text-black'
          : 'bg-[var(--color-cell-pressed)] text-white hover:bg-[var(--color-cell)]'
      }`}
    >
      {children}
    </button>
  );
}

function RotationExerciseRow({ label, exercise, onChange }) {
  return (
    <div className="sep-row flex items-center min-h-[60px] px-4 py-2.5 gap-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)] w-16 shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={exercise.name}
          onChange={e => onChange({ ...exercise, name: e.target.value })}
          onFocus={e => e.target.select()}
          placeholder={label}
          className="w-full bg-transparent text-[17px] text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...exercise, mode: exercise.mode === 'unilateral' ? 'standard' : 'unilateral' })}
        className={`press shrink-0 rounded-md px-2 py-1.5 text-[12px] font-medium ${
          exercise.mode === 'unilateral'
            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
            : 'bg-[var(--color-cell-pressed)] text-[var(--color-secondary)]'
        }`}
      >
        {exercise.mode === 'unilateral' ? 'Unilateral' : 'Standard'}
      </button>
    </div>
  );
}

function RotationBuilderView({ rotation, setRotation, onBack, onStart, onSave }) {
  const setField = (patch) => setRotation(r => ({ ...r, ...patch }));
  const updatePrimary = (next) => setRotation(r => ({ ...r, primary: next }));
  const updateAccessory = (idx, next) => setRotation(r => ({
    ...r, accessories: r.accessories.map((a, i) => i === idx ? next : a),
  }));
  const setAccessoryCount = (n) => {
    setRotation(r => {
      const current = r.accessories.length;
      if (n === current) return r;
      if (n > current) {
        const additions = [];
        for (let i = current; i < n; i++) {
          additions.push({ id: uid(), name: `Accessory ${i + 1}`, mode: 'standard' });
        }
        return { ...r, accessories: [...r.accessories, ...additions] };
      }
      return { ...r, accessories: r.accessories.slice(0, n) };
    });
  };

  const accN = rotation.accessories.length;
  const slotsPerSequence = 2 * accN;
  const totalSlots = rotation.rounds * slotsPerSequence;
  const totalDurationSec = totalSlots * rotation.intervalSec;
  const totalMin = Math.floor(totalDurationSec / 60);
  const totalRemSec = totalDurationSec % 60;
  const primarySets = rotation.rounds * accN;
  const accessorySets = rotation.rounds;

  return (
    <div className="slideIn pb-8">
      <NavBar
        title="Rotation"
        leftLabel="New"
        onLeft={onBack}
        rightLabel="Start"
        onRight={onStart}
      />

      <GroupHeader>Summary</GroupHeader>
      <Group>
        <div className="px-4 py-3 flex items-stretch divide-x divide-[var(--color-sep)]">
          <div className="flex-1 pr-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Total time</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">
              {totalMin}{totalRemSec > 0 ? `:${String(totalRemSec).padStart(2, '0')}` : ''}<span className="text-[13px] text-[var(--color-secondary)] font-normal ml-0.5">{totalRemSec > 0 ? '' : ' min'}</span>
            </div>
          </div>
          <div className="flex-1 px-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Total sets</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{totalSlots}</div>
          </div>
          <div className="flex-1 pl-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-secondary)]">Per seq.</div>
            <div className="tabular text-[20px] font-semibold mt-0.5">{slotsPerSequence}</div>
          </div>
        </div>
      </Group>
      <GroupFooter>
        Primary: <span className="text-white">{primarySets}</span> sets · Each accessory: <span className="text-white">{accessorySets}</span> sets
      </GroupFooter>

      <GroupHeader>Interval</GroupHeader>
      <Group>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {[30, 45, 60, 75, 90, 120].map(s => (
            <ChipPill key={s} active={rotation.intervalSec === s} onClick={() => setField({ intervalSec: s })}>
              {s}s
            </ChipPill>
          ))}
        </div>
      </Group>

      <GroupHeader>Accessories</GroupHeader>
      <Group>
        <div className="sep-row flex items-center justify-between px-4 py-2.5 min-h-[44px]">
          <div>
            <div className="text-[15px]">Number of accessories</div>
            <div className="text-[12px] text-[var(--color-secondary)] mt-0.5">One sequence = {slotsPerSequence} sets</div>
          </div>
          <div className="inline-flex items-center gap-1 bg-[var(--color-cell-pressed)] rounded-lg px-1 py-1">
            <button
              type="button"
              onClick={() => setAccessoryCount(Math.max(1, accN - 1))}
              disabled={accN <= 1}
              className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"
            >
              <Minus size={15} strokeWidth={2.5} />
            </button>
            <div className="tabular text-[15px] font-semibold min-w-[28px] text-center">{accN}</div>
            <button
              type="button"
              onClick={() => setAccessoryCount(Math.min(5, accN + 1))}
              disabled={accN >= 5}
              className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </Group>

      <GroupHeader>Sequence rounds</GroupHeader>
      <Group>
        <div className="sep-row flex items-center justify-between px-4 py-2.5 min-h-[44px]">
          <div>
            <div className="text-[15px]">How many times to repeat</div>
            <div className="text-[12px] text-[var(--color-secondary)] mt-0.5">{rotation.rounds} × {slotsPerSequence} = {totalSlots} sets total</div>
          </div>
          <div className="inline-flex items-center gap-1 bg-[var(--color-cell-pressed)] rounded-lg px-1 py-1">
            <button
              type="button"
              onClick={() => setField({ rounds: Math.max(1, rotation.rounds - 1) })}
              disabled={rotation.rounds <= 1}
              className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"
            >
              <Minus size={15} strokeWidth={2.5} />
            </button>
            <div className="tabular text-[15px] font-semibold min-w-[28px] text-center">{rotation.rounds}</div>
            <button
              type="button"
              onClick={() => setField({ rounds: Math.min(30, rotation.rounds + 1) })}
              disabled={rotation.rounds >= 30}
              className="press w-8 h-8 rounded-md text-white disabled:opacity-30 flex items-center justify-center"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </Group>

      <GroupHeader>Exercises</GroupHeader>
      <Group>
        <RotationExerciseRow label="Primary" exercise={rotation.primary} onChange={updatePrimary} />
        {rotation.accessories.map((acc, i) => (
          <RotationExerciseRow
            key={acc.id}
            label={`Acc ${i + 1}`}
            exercise={acc}
            onChange={(next) => updateAccessory(i, next)}
          />
        ))}
      </Group>
      <GroupFooter>
        Each sequence: primary → acc 1 → primary → acc 2{accN > 2 ? ` → primary → acc 3${accN > 3 ? '…' : ''}` : ''}.
      </GroupFooter>

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
// One-line summary for a saved item, read from its stored payload.
function describeItem(item) {
  if (item.sourceType === 'preset') {
    const cfg = CONFIG_BY_ID[item.configId];
    if (!cfg) return 'Preset config (unavailable)';
    const isAsym = cfg.style === 'asymmetric';
    return `${cfg.duration} min · ${isAsym ? `${cfg.intervalSec}+${cfg.extendedSec}s` : `${cfg.intervalSec}s`} · ${cfg.totalEx} ex · ${cfg.sets} sets each`;
  }
  if (item.sourceType === 'rotation') {
    const r = item.rotation;
    const accN = r.accessories.length;
    const totalSlots = r.rounds * 2 * accN;
    const totalMin = Math.round((totalSlots * r.intervalSec) / 60);
    return `Rotation · ${totalMin} min · ${r.intervalSec}s · primary + ${accN} accessor${accN === 1 ? 'y' : 'ies'} × ${r.rounds} rounds`;
  }
  const built = buildCustomSession(item.custom);
  return `Custom · ${built.durationMin} min · ${built.totalSets} sets · ${item.custom.circuits.length} circuit${item.custom.circuits.length > 1 ? 's' : ''}`;
}

// Small text-input dialog (folder create / rename). Mirrors SaveDialog's focus
// behavior so the iOS keyboard animation doesn't fight the field.
function FolderNameDialog({ open, title, defaultName, confirmLabel = 'Save', onClose, onSubmit }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) setName(defaultName || ''); }, [open, defaultName]);
  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus(); el.select();
    const t = setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'auto' }), 50);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  const submit = () => { if (name.trim()) { onSubmit(name.trim()); onClose(); } };
  return (
    <CenterCard open={open} onClose={onClose}>
      <div className="p-5 text-center">
        <div className="text-[17px] font-semibold">{title}</div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Folder name"
          className="mt-4 w-full bg-[var(--color-cell)] rounded-lg px-3 py-2.5 text-[15px] text-white text-center placeholder:text-[var(--color-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
        />
      </div>
      <div className="flex border-t border-white/10">
        <button type="button" onClick={onClose} className="press flex-1 h-11 text-[15px] text-[var(--color-accent)]">Cancel</button>
        <div className="w-px bg-white/10" />
        <button type="button" onClick={submit} disabled={!name.trim()} className="press flex-1 h-11 text-[15px] font-semibold text-[var(--color-accent)] disabled:opacity-30">{confirmLabel}</button>
      </div>
    </CenterCard>
  );
}

// Pick a destination folder for an item (or Unfiled). Current folder is checked.
function MoveToFolderSheet({ open, item, folders, onClose, onMove }) {
  if (!item) return null;
  const current = item.folderId ?? null;
  return (
    <Sheet open={open} onClose={onClose} title="Move to folder" primaryLabel="Done" onPrimary={onClose}>
      <Group>
        <Row onClick={() => { onMove(item.id, null); onClose(); }} selected={current == null}
          leading={<Folder size={18} strokeWidth={2.2} className="text-[var(--color-secondary)]" />}>
          Unfiled
        </Row>
        {folders.map(f => (
          <Row key={f.id} onClick={() => { onMove(item.id, f.id); onClose(); }} selected={current === f.id}
            leading={<Folder size={18} strokeWidth={2.2} className="text-[var(--color-accent)]" />}>
            {f.name}
          </Row>
        ))}
      </Group>
      {folders.length === 0 && (
        <GroupFooter>No folders yet. Create one from the Saved screen, then move timers into it.</GroupFooter>
      )}
    </Sheet>
  );
}

function LibraryView({ items, folders, folderHandlers, onClose, onLoad, onLog, onRequestDelete, footer }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null); // folder | null
  const [deleteTarget, setDeleteTarget] = useState(null); // folder | null
  const [moveTarget, setMoveTarget] = useState(null);      // item | null
  const [collapsed, setCollapsed] = useState({});          // folderId -> bool

  const sections = groupLibraryByFolder(items, folders);
  const toggle = (id) => setCollapsed(c => ({ ...c, [String(id)]: !c[String(id)] }));

  return (
    <div className="slideIn pb-8">
      <NavBar title="Saved" leftLabel="Done" onLeft={onClose}
        rightLabel="New folder" rightIcon={FolderPlus} onRight={() => setCreateOpen(true)} />

      {items.length === 0 && folders.length === 0 ? (
        <div className="px-4 mt-12 text-center">
          <Bookmark size={32} strokeWidth={2} className="mx-auto text-[var(--color-tertiary)]" />
          <div className="text-[17px] font-semibold mt-4">Nothing saved yet</div>
          <div className="text-[14px] text-[var(--color-secondary)] mt-1">When you build a session you like, tap Save to find it again here.</div>
        </div>
      ) : (
        <>
          {sections.map(section => {
            // Hide an empty Unfiled bucket once folders exist (avoids a lonely
            // "Unfiled · 0" header); always show real folders so they're targetable.
            if (section.isUnfiled && section.items.length === 0 && folders.length > 0) return null;
            const isCollapsed = !!collapsed[String(section.id)];
            return (
              <React.Fragment key={section.id ?? 'unfiled'}>
                <div className="px-4 mt-6 mb-1.5 flex items-center gap-2">
                  <button type="button" onClick={() => toggle(section.id)}
                    className="press flex items-center gap-1.5 text-[13px] uppercase tracking-wide text-[var(--color-secondary)] min-w-0">
                    {section.isUnfiled
                      ? <Folder size={14} strokeWidth={2.2} className="shrink-0" />
                      : <FolderOpen size={14} strokeWidth={2.2} className="shrink-0 text-[var(--color-accent)]" />}
                    <span className="truncate">{section.name}</span>
                    <span className="text-[var(--color-tertiary)]">{section.items.length}</span>
                    {isCollapsed
                      ? <ChevronRight size={14} strokeWidth={2.2} className="shrink-0" />
                      : <ChevronDown size={14} strokeWidth={2.2} className="shrink-0" />}
                  </button>
                  <div className="flex-1" />
                  {!section.isUnfiled && (
                    <>
                      <button type="button" onClick={() => setRenameTarget(section)}
                        aria-label={`Rename ${section.name}`} className="press text-[13px] text-[var(--color-accent)] px-1">Rename</button>
                      <button type="button" onClick={() => setDeleteTarget(section)}
                        aria-label={`Delete ${section.name}`} className="press text-[13px] text-red-400 px-1">Delete</button>
                    </>
                  )}
                </div>
                {!isCollapsed && (section.items.length === 0 ? (
                  <Group><div className="px-4 py-3 text-[13px] text-[var(--color-tertiary)]">Empty — move timers here with the folder button.</div></Group>
                ) : (
                  <Group>
                    {section.items.map(item => (
                      <div key={item.id} className="sep-row flex items-center min-h-[60px] pr-2">
                        <button type="button" onClick={() => onLoad(item)}
                          className="press flex-1 min-w-0 text-left flex items-center px-4 py-2.5 active:bg-[var(--color-cell-pressed)] rounded-l-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-[17px] text-white truncate">{item.name}</div>
                            <div className="text-[13px] text-[var(--color-secondary)] mt-0.5">{describeItem(item)}</div>
                          </div>
                          <ChevronRight size={16} strokeWidth={2} className="text-[var(--color-tertiary)] ml-3 shrink-0" />
                        </button>
                        <button type="button" onClick={() => setMoveTarget(item)} aria-label={`Move ${item.name}`}
                          className="press w-10 h-10 rounded-full text-[var(--color-secondary)] active:bg-[var(--color-cell-pressed)] flex items-center justify-center shrink-0 ml-1">
                          <FolderInput size={17} strokeWidth={2.2} />
                        </button>
                        <button type="button" onClick={() => onLog(item)} aria-label={`Log ${item.name}`}
                          className="press w-10 h-10 rounded-full text-[var(--color-accent)] active:bg-[var(--color-cell-pressed)] flex items-center justify-center shrink-0 ml-1">
                          <ClipboardList size={17} strokeWidth={2.2} />
                        </button>
                        <button type="button" onClick={() => onRequestDelete(item)} aria-label={`Delete ${item.name}`}
                          className="press w-10 h-10 rounded-full text-red-400 active:bg-red-500/10 flex items-center justify-center shrink-0 ml-1">
                          <Trash2 size={16} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                  </Group>
                ))}
              </React.Fragment>
            );
          })}
          <GroupFooter>Tap a session to load it. Folder icon moves it; clipboard logs a result; trash deletes.</GroupFooter>
        </>
      )}
      {footer}

      <FolderNameDialog
        open={createOpen}
        title="New folder"
        confirmLabel="Create"
        onClose={() => setCreateOpen(false)}
        onSubmit={(name) => folderHandlers.onCreate(name)}
      />
      <FolderNameDialog
        open={!!renameTarget}
        title="Rename folder"
        defaultName={renameTarget?.name}
        onClose={() => setRenameTarget(null)}
        onSubmit={(name) => folderHandlers.onRename(renameTarget.id, name)}
      />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete this folder?"
        body={<><span className="text-white">{deleteTarget?.name}</span> will be removed. Its timers move back to Unfiled — nothing is deleted.</>}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { folderHandlers.onDelete(deleteTarget.id); setDeleteTarget(null); }}
      />
      <MoveToFolderSheet
        open={!!moveTarget}
        item={moveTarget}
        folders={folders}
        onClose={() => setMoveTarget(null)}
        onMove={folderHandlers.onMoveItem}
      />
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

// Mid-session exercise editor: rename the current exercise and/or change its
// recording type. Changes apply FORWARD from the current slot only (the parent
// handler enforces this); already-logged rounds are untouched.
function ExerciseEditSheet({ open, initialName, initialMetricKind, onClose, onApply }) {
  const [name, setName] = useState(initialName || '');
  const [mk, setMk] = useState(initialMetricKind || DEFAULT_METRIC_KIND);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setName(initialName || '');
    setMk(initialMetricKind || DEFAULT_METRIC_KIND);
  }, [open, initialName, initialMetricKind]);
  if (!open) return null;
  const apply = () => { onApply(name, mk); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title="Change exercise" primaryLabel="Apply" onPrimary={apply}>
      <Group>
        <div className="px-4 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
            placeholder="Exercise name"
            className="w-full bg-transparent text-[17px] font-semibold text-white placeholder:text-[var(--color-tertiary)] focus:outline-none"
          />
        </div>
        <div className="sep-row flex items-center justify-between px-4 py-2.5">
          <span className="text-[15px] text-[var(--color-secondary)]">Recording type</span>
          <select
            value={mk}
            onChange={(e) => setMk(e.target.value)}
            className="bg-[var(--color-cell-pressed)] rounded-lg px-2 py-1.5 text-[14px] text-white focus:outline-none"
          >
            {METRIC_KINDS.map((k) => <option key={k} value={k}>{METRIC_LABEL[k]}</option>)}
          </select>
        </div>
      </Group>
      <GroupFooter>Applies from this set forward. Sets you already logged keep their exercise and type.</GroupFooter>
    </Sheet>
  );
}

function TimerView({ session, onRequestBack, onLogResult, onReview, activeLogHasContent, activeLog, exerciseHistory = {}, onStartDraft, onUpdateDraft }) {
  // Slots are LOCAL state (seeded from the session) so an exercise can be
  // renamed / re-typed mid-run without rebuilding the whole session. Re-seeds
  // whenever the session identity changes (i.e. a fresh run from the builder).
  const [slots, setSlots] = useState(() => session.slots);
  useEffect(() => { setSlots(session.slots); }, [session]);
  const totalSlots = slots.length;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => session.slots[0]?.duration ?? 60);
  const [running, setRunning] = useState(false);
  const [preCount, setPreCount] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  // Inline logger: while an input is focused we "freeze" its target so a round
  // flip mid-typing doesn't yank the fields to the next exercise.
  const [frozenTarget, setFrozenTarget] = useState(null); // { exName, setIdx } | null
  const [editOpen, setEditOpen] = useState(false); // mid-session exercise editor
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
          if (audioOn && !slot.isRest) {
            if (prev === 11) cues.warning10sec();
            if (prev === 4) cues.preTick(3);
            if (prev === 3) cues.preTick(2);
            if (prev === 2) cues.preTick(1);
          }
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

  // The "live" inline-log target derived from the timer: the most recent working
  // slot at/before now, and which set number that is for its exercise (the slot
  // IS the set). Null during the lead-in before any work.
  const liveTarget = (() => {
    let i = Math.min(currentIdx, totalSlots - 1);
    while (i >= 0 && slots[i]?.isRest) i--;
    if (i < 0) return null;
    const name = slots[i].name;
    const key = normalizeExerciseName(name);
    // The slot IS the set, but a uniform-unilateral exercise emits L then R for
    // ONE logical set. Count only non-R slots (matches expandSetsFromSlots), so
    // both the L and R slot map to the same set index.
    let setIdx = -1;
    for (let j = 0; j <= i; j++) {
      if (slots[j].isRest || slots[j].side === 'R') continue;
      if (normalizeExerciseName(slots[j].name) === key) setIdx++;
    }
    return { exName: name, setIdx: Math.max(0, setIdx) };
  })();
  // Frozen while typing, otherwise follows the timer.
  const logTarget = frozenTarget || liveTarget;

  // Resolve the recording type for an exercise name at this moment, most
  // authoritative first: live draft exercise > the type configured on its slot
  // (pre-config or a mid-session swap) > history/catalog hint > default.
  const resolveMetricKind = (name) => {
    const key = normalizeExerciseName(name);
    const draftEx = activeLog?.exercises.find((e) => normalizeExerciseName(e.nameSnapshot) === key);
    if (draftEx?.metricKind) return draftEx.metricKind;
    const slot = slots.find((s) => !s.isRest && normalizeExerciseName(s.name) === key && s.metricKind);
    return slot?.metricKind || exerciseHistory[key]?.metricKind || 'weight_reps';
  };

  // Write a single field for the target set, lazily creating the draft (and a
  // draft exercise for a mid-session swap-in that has no row yet) and padding
  // sets if needed. The value cascades to every later set that's still blank or
  // auto-filled (hand-edited sets are preserved). Auto-saves (App persists), so
  // cascade-filled sets are there when the timer reaches them and when the
  // post-completion editor opens.
  const commitLog = (exName, setIdx, field, value) => {
    let draft = activeLog || (onStartDraft && onStartDraft());
    if (!draft) return;
    const key = normalizeExerciseName(exName);
    const exIdx = draft.exercises.findIndex((e) => normalizeExerciseName(e.nameSnapshot) === key);
    if (exIdx < 0) {
      // Swapped-in exercise with no draft row yet — create it on first log.
      const mk = resolveMetricKind(exName);
      let sets = [];
      while (sets.length <= setIdx) sets.push(emptySet(mk));
      sets = cascadeField(sets, setIdx, field, value);
      const newEx = emptyExercise({ name: exName, metricKind: mk, setCount: 0 });
      onUpdateDraft({ ...draft, exercises: [...draft.exercises, { ...newEx, sets }] });
      return;
    }
    const ex = draft.exercises[exIdx];
    let sets = ex.sets.slice();
    while (sets.length <= setIdx) sets.push(emptySet(ex.metricKind));
    sets = cascadeField(sets, setIdx, field, value);
    onUpdateDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === exIdx ? { ...ex, sets } : e)) });
  };

  // The dot is a completeness indicator, not a manual toggle. Tapping a blank
  // set fills it from last time's values (one-tap "same as last time"), which
  // then cascades downward; once a set has data the dot is status-only.
  const confirmLog = (exName, setIdx) => {
    let draft = activeLog || (onStartDraft && onStartDraft());
    if (!draft) return;
    const key = normalizeExerciseName(exName);
    const exIdx = draft.exercises.findIndex((e) => normalizeExerciseName(e.nameSnapshot) === key);
    if (exIdx < 0) return;
    const ex = draft.exercises[exIdx];
    let sets = ex.sets.slice();
    while (sets.length <= setIdx) sets.push(emptySet(ex.metricKind));
    const s = sets[setIdx];
    const sugg = exerciseHistory[key]?.suggestions?.[setIdx];
    const empty = ALL_SET_FIELDS.every((f) => s[f] == null || s[f] === '');
    if (!(empty && sugg)) return;
    // Copy only metric fields — never id/extras from the prior saved set.
    for (const f of fieldsForMetric(ex.metricKind)) {
      if (sugg[f] != null) sets = cascadeField(sets, setIdx, f, sugg[f]);
    }
    onUpdateDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === exIdx ? { ...ex, sets } : e)) });
  };

  // Mid-session swap / recording-type change. Cascades FORWARD only: from the
  // current slot onward, this exercise adopts the new name and/or recording type;
  // already-completed rounds keep their original exercise and data.
  //   - Rename  -> the old draft exercise is truncated to its already-performed
  //               sets; the renamed exercise is created lazily on the next log
  //               (its set count restarts at 1), so past + future are separate
  //               rows in history — exactly the "did A for 5, then B for 5" case.
  //   - Type only (same name) -> convert the current exercise's metric in place,
  //               carrying fields valid in both kinds (model stores one kind per
  //               exercise, so this is the one change that isn't a forward split).
  const applyExerciseEdit = (rawName, newMk) => {
    if (isComplete || !currentSlot || currentSlot.isRest) return;
    const curName = currentSlot.name;
    const curKey = normalizeExerciseName(curName);
    const newName = (rawName || '').trim() || curName;
    const renamed = normalizeExerciseName(newName) !== curKey;
    const keepUpTo = liveTarget?.setIdx ?? 0; // sets performed before this slot

    // 1) Forward-only slot rewrite.
    setSlots((prev) => prev.map((s, i) => {
      if (i < currentIdx || s.isRest) return s;
      if (normalizeExerciseName(s.name) !== curKey) return s;
      return { ...s, name: newName, metricKind: newMk };
    }));

    // 2) Draft reconciliation (only if something's been logged).
    const draft = activeLog;
    if (!draft) return;
    const oldIdx = draft.exercises.findIndex((e) => normalizeExerciseName(e.nameSnapshot) === curKey);
    if (oldIdx < 0) return;
    const ex = draft.exercises[oldIdx];

    if (renamed) {
      const trimmed = { ...ex, sets: ex.sets.slice(0, keepUpTo) };
      onUpdateDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === oldIdx ? trimmed : e)) });
    } else if (ex.metricKind !== newMk) {
      const keepFields = fieldsForMetric(newMk).filter((f) => fieldsForMetric(ex.metricKind).includes(f));
      const sets = ex.sets.map((s) => {
        const ns = emptySet(newMk); ns.id = s.id; ns.done = s.done;
        for (const f of keepFields) ns[f] = s[f];
        return ns;
      });
      onUpdateDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === oldIdx ? { ...ex, metricKind: newMk, sets } : e)) });
    }
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

  // round indicator. Intra-circuit rests carry a round in meta; between-circuit
  // rests don't (so they keep the simpler label).
  const roundLine = currentSlot?.isRest
    ? (currentSlot?.meta?.round
      ? `Circuit ${currentSlot.meta.circuit}/${currentSlot.meta.totalCircuits} · Round ${currentSlot.meta.round}/${currentSlot.meta.totalRoundsInCircuit}`
      : 'Rest between circuits')
    : currentSlot?.meta?.circuit
    ? `Circuit ${currentSlot.meta.circuit}/${currentSlot.meta.totalCircuits} · Round ${currentSlot.meta.round}/${currentSlot.meta.totalRoundsInCircuit}`
    : currentSlot?.meta?.round
    ? `Round ${currentSlot.meta.round}/${currentSlot.meta.totalRounds}`
    : '';

  return (
    <div className="slideIn pb-8">
      <NavBar title={session.type === 'custom' ? 'Custom' : 'Workout'} leftLabel="Setup" onLeft={onRequestBack} />

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
            {currentSlot.isRest ? (
              <div className="text-[22px] font-semibold tracking-tight">{currentSlot.name}</div>
            ) : (
              <button type="button" onClick={() => setEditOpen(true)}
                className="press inline-flex items-center gap-1.5 max-w-full"
                aria-label="Change exercise or recording type">
                <span className="text-[22px] font-semibold tracking-tight truncate">{currentSlot.name}</span>
                <Pencil size={15} strokeWidth={2.2} className="text-[var(--color-tertiary)] shrink-0" />
              </button>
            )}
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

          {logTarget && (() => {
            const key = normalizeExerciseName(logTarget.exName);
            const h = exerciseHistory[key];
            const draftEx = activeLog?.exercises.find((e) => normalizeExerciseName(e.nameSnapshot) === key);
            // Draft wins (a live recording-type change or pre-config), then the
            // slot's configured type, then the history hint, then the default.
            const slotMk = slots.find((s) => !s.isRest && normalizeExerciseName(s.name) === key && s.metricKind)?.metricKind;
            const metricKind = draftEx?.metricKind || slotMk || h?.metricKind || 'weight_reps';
            const fields = fieldsForMetric(metricKind);
            const curSet = draftEx?.sets?.[logTarget.setIdx];
            const sugg = h?.suggestions?.[logTarget.setIdx];
            const last = h?.recent?.[0];
            const PH = { weight: 'wt', reps: 'reps', rpe: 'rpe', timeSec: 'sec', distance: 'dist', color: 'color', value: 'val' };
            const iv = (v) => (v == null ? '' : v);
            return (
              <div className="mt-4 px-4">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[12px] text-[var(--color-secondary)] shrink-0">{logTarget.exName !== currentSlot.name ? `${logTarget.exName} · ` : ''}Set {logTarget.setIdx + 1}</span>
                  {fields.map((f) => {
                    const isText = SET_TEXT_FIELDS.includes(f);
                    return (
                    <input key={f} type="text" inputMode={isText ? 'text' : 'decimal'}
                      value={iv(curSet?.[f])}
                      onChange={(e) => commitLog(logTarget.exName, logTarget.setIdx, f, e.target.value)}
                      onFocus={(e) => { e.target.select(); setFrozenTarget(logTarget); }}
                      onBlur={() => setFrozenTarget(null)}
                      placeholder={sugg?.[f] != null ? String(sugg[f]) : PH[f]}
                      className={`${isText ? 'w-24' : 'w-16'} bg-[var(--color-cell)] rounded-lg px-2 py-2 text-[17px] text-white text-center placeholder:text-[var(--color-tertiary)] focus:outline-none ${isText ? '' : 'tabular'}`} />
                    );
                  })}
                  {(() => {
                    const complete = isSetComplete(curSet, metricKind);
                    return (
                  <button type="button" onClick={() => confirmLog(logTarget.exName, logTarget.setIdx)} aria-label="Set complete"
                    className="press w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
                    style={{ background: complete ? ringColor : 'transparent', borderColor: complete ? ringColor : 'var(--color-sep)' }}>
                    {complete && <Check size={16} strokeWidth={3} className="text-black" />}
                  </button>
                    );
                  })()}
                </div>
                {last && (
                  <div className="text-center text-[12px] text-[var(--color-tertiary)] mt-1.5 tabular truncate">
                    Last: {formatSetGroups(last.sets, metricKind)}
                  </div>
                )}
              </div>
            );
          })()}

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
        {isComplete && (activeLogHasContent ? (
          <button type="button" onClick={onReview}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}>
            <ClipboardList size={18} strokeWidth={2.5} />
            Review &amp; save
          </button>
        ) : onLogResult ? (
          <button type="button" onClick={onLogResult}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2"
            style={{ background: ringColor, color: '#000' }}>
            <ClipboardList size={18} strokeWidth={2.5} />
            Log result
          </button>
        ) : null)}
        {isComplete && (
          <button type="button" onClick={start}
            className="press w-full h-14 rounded-2xl text-[17px] font-semibold inline-flex items-center justify-center gap-2 bg-[var(--color-cell)]">
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

      <ExerciseEditSheet
        open={editOpen && !!currentSlot && !currentSlot.isRest}
        initialName={currentSlot?.name || ''}
        initialMetricKind={currentSlot && !currentSlot.isRest ? resolveMetricKind(currentSlot.name) : DEFAULT_METRIC_KIND}
        onClose={() => setEditOpen(false)}
        onApply={applyExerciseEdit}
      />
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
  const [folders, setFolders] = useState(() => loadFolders());
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadedFromId, setLoadedFromId] = useState(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [rotation, setRotation] = useState(null);
  const [journal, setJournal] = useState(() => loadJournal());
  const [catalog, setCatalog] = useState(() => loadExercises());
  const [pendingOrigin, setPendingOrigin] = useState(null); // timer launch context
  const [logDraft, setLogDraft] = useState(null);
  const [logSuggestions, setLogSuggestions] = useState({}); // exerciseId -> prior session's sets
  const [logMode, setLogMode] = useState('create');
  const [logReturnTo, setLogReturnTo] = useState('history');
  const [pendingJournalDelete, setPendingJournalDelete] = useState(null);
  const [activeLog, setActiveLog] = useState(() => loadActiveLog()); // in-progress workout draft
  const [schedule, setSchedule] = useState(() => loadSchedule());
  const [scheduledLaunch, setScheduledLaunch] = useState(null); // schedule context carried builder->timer
  const [reviewOpen, setReviewOpen] = useState(false); // in-timer review sheet
  const [pendingTimerBack, setPendingTimerBack] = useState(false); // leave-timer prompt
  const [pendingDiscardDraft, setPendingDiscardDraft] = useState(false);
  const [pendingStartTimer, setPendingStartTimer] = useState(false); // start-with-unsaved-draft prompt
  const [discardLeavePending, setDiscardLeavePending] = useState(false); // discard should also leave the timer

  const persist = (next) => { setLibrary(next); saveLibrary(next); };
  const persistFolders = (next) => { setFolders(next); saveFolders(next); };
  const persistJournal = (next) => { setJournal(next); saveJournal(next); };
  const persistCatalog = (next) => { setCatalog(next); saveExercises(next); };
  const persistActiveLog = (next) => { setActiveLog(next); if (next) saveActiveLog(next); else clearActiveLog(); };
  const persistSchedule = (next) => { setSchedule(next); saveSchedule(next); };

  const pickPreset = (config) => {
    setMode('preset');
    setCustomSession(null);
    setRotation(null);
    setPresetConfig(config);
    setPresetBlocks(makeBlocks(config.bilateral, config.unilateral));
    setLoadedFromId(null);
    setScheduledLaunch(null);
    setView('configure');
  };
  const pickCustom = () => {
    setMode('custom');
    setPresetConfig(null);
    setPresetBlocks([]);
    setRotation(null);
    setCustomSession(emptyCustom());
    setLoadedFromId(null);
    setScheduledLaunch(null);
    setView('customBuilder');
  };
  const pickRotation = () => {
    setMode('rotation');
    setPresetConfig(null);
    setPresetBlocks([]);
    setCustomSession(null);
    setRotation(emptyRotation());
    setLoadedFromId(null);
    setScheduledLaunch(null);
    setView('rotationBuilder');
  };
  const openLibrary = () => setView('library');
  const closeLibrary = () => setView('wizard');
  const goBackToWizard = () => { setLoadedFromId(null); setPendingOrigin(null); setScheduledLaunch(null); setView('wizard'); };

  const loadFromLibrary = (item) => {
    if (item.sourceType === 'preset') {
      const cfg = CONFIG_BY_ID[item.configId];
      if (!cfg) return;
      setMode('preset');
      setCustomSession(null);
      setRotation(null);
      setPresetConfig(cfg);
      setPresetBlocks(item.blocks.map(b => ({ ...b, id: uid() })));
      setLoadedFromId(item.id);
      setView('configure');
    } else if (item.sourceType === 'rotation') {
      setMode('rotation');
      setPresetConfig(null);
      setPresetBlocks([]);
      setCustomSession(null);
      // re-seed ids on exercises so React keys stay stable
      const rot = JSON.parse(JSON.stringify(item.rotation));
      rot.primary.id = uid();
      rot.accessories = rot.accessories.map(a => ({ ...a, id: uid() }));
      setRotation(rot);
      setLoadedFromId(item.id);
      setView('rotationBuilder');
    } else {
      setMode('custom');
      setPresetConfig(null);
      setPresetBlocks([]);
      setRotation(null);
      setCustomSession(JSON.parse(JSON.stringify(item.custom)));
      setLoadedFromId(item.id);
      setView('customBuilder');
    }
  };

  const requestDelete = (item) => setPendingDelete(item);
  const confirmDelete = () => {
    if (!pendingDelete) return;
    persist(library.filter(i => i.id !== pendingDelete.id));
    if (pendingDelete.id === loadedFromId) setLoadedFromId(null);
    setPendingDelete(null);
  };

  // --- folders --------------------------------------------------------------
  const folderHandlers = {
    onCreate: (name) => { if (name && name.trim()) persistFolders(addFolder(folders, name).folders); },
    onRename: (id, name) => persistFolders(renameFolder(folders, id, name)),
    // Deleting a folder unfiles its timers (back to root) — never deletes them.
    onDelete: (id) => { persist(unfileItems(library, id)); persistFolders(removeFolder(folders, id)); },
    onMoveItem: (itemId, folderId) => persist(moveItemToFolder(library, itemId, folderId)),
  };

  const triggerSave = () => {
    if (loadedFromId && library.some(i => i.id === loadedFromId)) {
      setSavePromptOpen(true);
    } else {
      setSaveOpen(true);
    }
  };

  const updateCurrent = () => {
    if (!loadedFromId) return;
    const next = library.map(i => {
      if (i.id !== loadedFromId) return i;
      const patch = { savedAt: Date.now() };
      if (mode === 'preset' && presetConfig) {
        patch.sourceType = 'preset';
        patch.configId = presetConfig.id;
        patch.blocks = presetBlocks.map(b => ({ type: b.type, name: b.name }));
      } else if (mode === 'custom' && customSession) {
        patch.sourceType = 'custom';
        patch.custom = JSON.parse(JSON.stringify(customSession));
      } else if (mode === 'rotation' && rotation) {
        patch.sourceType = 'rotation';
        patch.rotation = JSON.parse(JSON.stringify(rotation));
      }
      return { ...i, ...patch };
    });
    persist(next);
    setSavePromptOpen(false);
  };

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
    } else if (mode === 'rotation' && rotation) {
      item = {
        id: uid(), savedAt: Date.now(), name,
        sourceType: 'rotation',
        rotation: JSON.parse(JSON.stringify(rotation)),
      };
    }
    if (item) {
      persist([item, ...library]);
      setLoadedFromId(item.id);
    }
  };

  const originalName = library.find(i => i.id === loadedFromId)?.name || '';

  const defaultName = mode === 'preset' && presetConfig
    ? `${presetConfig.duration}m · ${presetConfig.totalEx} ex × ${presetConfig.sets}`
    : mode === 'custom' && customSession
    ? customSession.circuits[0]?.exercises?.[0]?.name || 'Custom session'
    : mode === 'rotation' && rotation
    ? `${rotation.primary.name} + ${rotation.accessories.length} accessories`
    : '';

  // Build the session from the CURRENT builder state, ungated by view, so timer
  // launch can read durationMin for pendingOrigin. The memo below stays gated to
  // avoid keeping a stale session around after returning to the wizard.
  const buildCurrentSession = () => {
    if (mode === 'preset' && presetConfig && presetBlocks?.length) return buildPresetSession(presetConfig, presetBlocks);
    if (mode === 'custom' && customSession) return buildCustomSession(customSession);
    if (mode === 'rotation' && rotation) return buildRotationSession(rotation);
    return null;
  };

  const doStartTimer = () => {
    const s = buildCurrentSession();
    const name = (loadedFromId ? originalName : defaultName) || 'Workout';
    const sl = scheduledLaunch || {};
    setPendingOrigin({
      origin: {
        libraryId: loadedFromId ?? null,
        scheduleRuleId: sl.scheduleRuleId ?? null,
        scheduleOneOffId: sl.scheduleOneOffId ?? null,
        occurrenceDate: sl.occurrenceDate ?? null,
        viaTimer: false,
      },
      sessionName: name,
      sourceType: mode,
      durationMin: s?.durationMin ?? null,
    });
    setScheduledLaunch(null); // captured into pendingOrigin
    setView('timer');
  };

  // Guard: don't silently reuse a previous workout's unsaved draft for a new run.
  const startTimer = () => {
    if (activeLog && hasLoggedContent(activeLog)) { setPendingStartTimer(true); return; }
    doStartTimer();
  };

  // --- journal entry points -------------------------------------------------
  // Positional last-time sets per exercise, rendered as editor placeholders.
  const buildSuggestions = (exercises, opts) => {
    const m = {};
    for (const ex of exercises || []) {
      if (!ex.exerciseId) continue;
      const s = suggestionsForExercise(journal, ex.exerciseId, opts);
      if (s.length) m[ex.exerciseId] = s;
    }
    return m;
  };

  const openLogForItem = (item) => {
    const derived = exercisesForItem(item);
    // Don't persist the catalog at open time — saveLog resolves + persists names
    // on save, so cancelling never leaves orphan entries. Carry-forward is
    // unaffected: existing exercises resolve to their persisted ids; brand-new
    // names have no history to carry regardless.
    const seed = seedExercisesForLog({ derived, catalog, journal, beforeDate: todayKey() });
    setLogDraft(createEntry({
      sessionName: item.name,
      sourceType: item.sourceType,
      origin: { libraryId: item.id },
      exercises: seed.exercises,
    }));
    setLogSuggestions(buildSuggestions(seed.exercises, { beforeDate: todayKey() }));
    setLogMode('create');
    setLogReturnTo('library');
    setView('logEditor');
  };

  // Fresh end-of-timer log (no inline draft). When a draft has content, the
  // completion screen routes to the review sheet instead, so this stays simple.
  const openLogFromTimer = () => {
    const s = buildCurrentSession();
    const derived = s ? expandSetsFromSlots(s.slots) : [];
    // Don't persist the catalog at open time — saveLog resolves + persists names
    // on save, so cancelling never leaves orphan entries. Carry-forward is
    // unaffected: existing exercises resolve to their persisted ids; brand-new
    // names have no history to carry regardless.
    const seed = seedExercisesForLog({ derived, catalog, journal, beforeDate: todayKey() });
    const po = pendingOrigin || {};
    setLogDraft(createEntry({
      sessionName: po.sessionName || 'Workout',
      sourceType: po.sourceType || 'adhoc',
      durationMin: po.durationMin ?? s?.durationMin ?? null,
      origin: { ...(po.origin || {}), viaTimer: true },
      exercises: seed.exercises,
    }));
    setLogSuggestions(buildSuggestions(seed.exercises, { beforeDate: todayKey() }));
    setLogMode('create');
    setLogReturnTo('timer');
    setView('logEditor');
  };

  // Active in-progress draft (in-timer logging). Created lazily on first log.
  const startActiveDraft = () => {
    if (activeLog) return activeLog;
    const s = buildCurrentSession();
    const derived = s ? expandSetsFromSlots(s.slots) : [];
    const seed = seedExercisesForLog({ derived, catalog, journal, beforeDate: todayKey() });
    const po = pendingOrigin || {};
    const draft = createEntry({
      sessionName: po.sessionName || 'Workout',
      sourceType: po.sourceType || 'adhoc',
      durationMin: po.durationMin ?? s?.durationMin ?? null,
      origin: { ...(po.origin || {}), viaTimer: true },
      exercises: seed.exercises,
    });
    persistActiveLog(draft);
    return draft;
  };

  // Open the full editor on the active draft. Reachable from the timer completion
  // and from the resume banner on a top-level view, so return to wherever we are.
  const openReviewFromDraft = () => {
    if (!activeLog) return;
    setLogDraft(activeLog);
    setLogSuggestions(buildSuggestions(activeLog.exercises, { beforeDate: activeLog.date }));
    setLogMode('create');
    setLogReturnTo(view === 'timer' ? 'timer' : 'history');
    setView('logEditor');
  };

  const openAdhocLog = () => {
    setLogDraft(createEntry({ sourceType: 'adhoc', origin: {}, exercises: [] }));
    setLogSuggestions({});
    setLogMode('create');
    setLogReturnTo('history');
    setView('logEditor');
  };

  const openEditLog = (entry) => {
    setLogDraft(entry);
    // Don't read the entry being edited, or anything newer than its date.
    setLogSuggestions(buildSuggestions(entry.exercises, { beforeDate: entry.date, excludeId: entry.id }));
    setLogMode('edit');
    setLogReturnTo('history');
    setView('logEditor');
  };

  // Shared finalize path: drop blank-name exercises, prune untouched
  // suggestion-only sets and the exercises left empty, resolve catalog ids, then
  // upsert. Used by BOTH the full editor and the in-timer review so pruning +
  // catalog resolution stay identical.
  const commitEntryToJournal = (entry) => {
    const named = (entry.exercises || []).filter((ex) => (ex.nameSnapshot || '').trim());
    const pruned = pruneEntry({ ...entry, exercises: named });
    let cat = catalog;
    const exercises = pruned.exercises.map((ex) => {
      const name = ex.nameSnapshot.trim();
      const r = ensureExercise(cat, name);
      cat = r.catalog;
      // Coerce values here so BOTH paths (full editor + in-timer review) store
      // numbers as numbers and text fields trimmed, regardless of how raw the
      // draft's strings were.
      return { ...ex, nameSnapshot: name, exerciseId: r.exercise.id, sets: ex.sets.map(coerceSet) };
    });
    if (cat !== catalog) persistCatalog(cat);
    persistJournal(upsertEntry(journal, withUpdatedAt({ ...pruned, exercises }, Date.now())));
  };

  const saveLog = (entry) => {
    commitEntryToJournal(entry);
    // If this was the in-progress workout draft, clear it (and its provenance).
    if (activeLog && activeLog.id === entry.id) { persistActiveLog(null); setPendingOrigin(null); }
    setLogDraft(null);
    // Calendar-origin logs return to the calendar (see the day go green); others
    // land in History to confirm the new entry.
    setView(logReturnTo === 'calendar' ? 'calendar' : 'history');
  };

  // Save-to-history from the in-timer review sheet (same commit path as the editor).
  const finalizeActiveDraft = () => {
    if (!activeLog) return;
    commitEntryToJournal(activeLog);
    persistActiveLog(null);
    setPendingOrigin(null);
    setReviewOpen(false);
    setView('history');
  };

  const discardActiveDraft = () => {
    persistActiveLog(null);
    setPendingOrigin(null);
    setReviewOpen(false);
    setPendingDiscardDraft(false);
    // If discard was chosen from the leave-timer prompt, complete the leave.
    if (discardLeavePending) { setDiscardLeavePending(false); timerBack(); }
  };

  const cancelLog = () => { setLogDraft(null); setView(logReturnTo); };

  // --- calendar / scheduling ------------------------------------------------
  const calendarHandlers = {
    onStart: (occ) => {
      const item = library.find((i) => i.id === occ.libraryId);
      if (!item) return;
      setScheduledLaunch({ scheduleRuleId: occ.ruleId, scheduleOneOffId: occ.oneOffId, occurrenceDate: occ.date });
      loadFromLibrary(item); // -> builder; Start there carries scheduledLaunch into pendingOrigin
    },
    onLog: (occ) => {
      const item = library.find((i) => i.id === occ.libraryId);
      if (!item) return;
      const derived = exercisesForItem(item);
      const seed = seedExercisesForLog({ derived, catalog, journal, beforeDate: occ.date });
      setLogDraft(createEntry({
        date: occ.date,
        sessionName: item.name,
        sourceType: item.sourceType,
        origin: { libraryId: item.id, scheduleRuleId: occ.ruleId, scheduleOneOffId: occ.oneOffId, occurrenceDate: occ.date },
        exercises: seed.exercises,
      }));
      setLogSuggestions(buildSuggestions(seed.exercises, { beforeDate: occ.date }));
      setLogMode('create');
      setLogReturnTo('calendar');
      setView('logEditor');
    },
    onSkip: (occ) => {
      if (occ.source === 'rule') persistSchedule(addException(schedule, occ.ruleId, occ.date));
      else persistSchedule(setOneOffStatus(schedule, occ.oneOffId, 'skipped'));
    },
    onRemove: (occ) => {
      if (occ.source === 'rule') persistSchedule(removeRule(schedule, occ.ruleId));
      else persistSchedule(removeOneOff(schedule, occ.oneOffId));
    },
    onAddOneOff: (date, item) => {
      persistSchedule(addOneOff(schedule, { id: uid(), date, libraryId: item.id, name: item.name, status: 'planned', createdAt: Date.now() }));
    },
    onAddWeekly: (item, daysOfWeek, startDate) => {
      // Start the recurrence on the tapped day so it doesn't backfill prior weeks.
      persistSchedule(addRule(schedule, { id: uid(), libraryId: item.id, name: item.name, kind: 'weekly', daysOfWeek, startDate, createdAt: Date.now() }));
    },
    onAddEveryN: (item, intervalDays, anchorDate, repeats) => {
      // anchorDate doubles as the start. `repeats` = total sessions (incl. the
      // first); bound it via endDate = anchor + (repeats-1)*interval. Blank = open.
      const endDate = repeats && repeats >= 1 ? addDays(anchorDate, (repeats - 1) * intervalDays) : null;
      persistSchedule(addRule(schedule, { id: uid(), libraryId: item.id, name: item.name, kind: 'everyN', intervalDays, anchorDate, startDate: anchorDate, endDate, createdAt: Date.now() }));
    },
    onCopyToDate: (occ, date) => {
      persistSchedule(addOneOff(schedule, { id: uid(), date, libraryId: occ.libraryId, name: occ.name, status: 'planned', createdAt: Date.now() }));
    },
    onMoveToDate: (occ, date) => {
      // one-off: relocate it. rule occurrence: skip the original date + drop a one-off
      // on the target (move = skip + oneOff, per the model).
      let s = occ.source === 'oneoff' ? removeOneOff(schedule, occ.oneOffId) : addException(schedule, occ.ruleId, occ.date);
      s = addOneOff(s, { id: uid(), date, libraryId: occ.libraryId, name: occ.name, status: 'planned', createdAt: Date.now() });
      persistSchedule(s);
    },
  };

  const requestJournalDelete = (entry) => setPendingJournalDelete(entry);
  const confirmJournalDelete = () => {
    if (!pendingJournalDelete) return;
    persistJournal(removeEntry(journal, pendingJournalDelete.id));
    setPendingJournalDelete(null);
  };

  // --- backup ---------------------------------------------------------------
  const getBackup = () => buildBackup({ library, folders, exercises: catalog, journal, schedule });
  const onImported = (parsed) => {
    setLibrary(parsed.library);
    setFolders(parsed.folders);
    setJournal(parsed.journal);
    setCatalog(parsed.exercises);
    setSchedule(parsed.schedule);
    setLoadedFromId(null);
    setActiveLog(null); // importAll() cleared localStorage; clear in-memory state too
  };

  // --- in-timer draft lifecycle --------------------------------------------
  const draftHasContent = !!activeLog && hasLoggedContent(activeLog);
  const draftSetCount = activeLog
    ? activeLog.exercises.reduce((n, ex) => n + (ex.sets || []).filter(isLoggedSet).length, 0)
    : 0;
  const timerBack = () => setView(mode === 'custom' ? 'customBuilder' : mode === 'rotation' ? 'rotationBuilder' : 'configure');
  const onRequestBack = () => {
    if (draftHasContent) setPendingTimerBack(true);
    else timerBack();
  };

  // --- tab bar --------------------------------------------------------------
  const showTabBar = view === 'wizard' || view === 'calendar' || view === 'history' || view === 'library';
  const activeTab = view === 'calendar' ? 'calendar' : view === 'history' ? 'history' : view === 'library' ? 'library' : 'train';
  const selectTab = (id) => {
    if (id === 'train') goBackToWizard();
    else if (id === 'calendar') setView('calendar');
    else if (id === 'history') setView('history');
    else setView('library');
  };

  // Today's planned (not done, not skipped) occurrences for the Train-home strip.
  const todaysOccurrences = useMemo(() => {
    const tk = todayKey();
    const done = scheduledDoneKeys(journal);
    return occurrencesInRange(schedule, tk, tk).filter((o) => !done.has(o.id) && o.status !== 'skipped');
  }, [schedule, journal]);

  const session = useMemo(() => (view === 'timer' ? buildCurrentSession() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, mode, presetConfig, presetBlocks, customSession, rotation]);

  // Per-exercise history for the active timer session, keyed by normalized name
  // (1:1 with exerciseId here — the scaffold dedupes by normalized name; the
  // value carries exerciseId to disambiguate). Read-only: uses findExercise, so
  // it never creates catalog entries just to show a hint.
  const exerciseHistory = useMemo(() => {
    if (view !== 'timer' || !session) return {};
    const map = {};
    for (const d of expandSetsFromSlots(session.slots)) {
      const key = normalizeExerciseName(d.name);
      if (map[key]) continue;
      const ex = findExercise(catalog, d.name);
      const prev = ex ? lastExerciseLogged(journal, ex.id, { beforeDate: todayKey() }) : null;
      // Configured recording type (from the timer) wins as the default; fall back
      // to the exercise's last-logged kind, then catalog default. Brand-new names
      // (no catalog entry) still get an entry so the logger knows their type.
      map[key] = {
        exerciseId: ex?.id || null,
        metricKind: d.metricKind || prev?.metricKind || ex?.defaultMetricKind || 'weight_reps',
        recent: ex ? recentSessionsForExercise(journal, ex.id, 3) : [],
        suggestions: prev?.sets || [],
      };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, session, catalog, journal]);

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className={`max-w-[440px] mx-auto ${showTabBar ? 'pb-24' : ''}`}>
        {showTabBar && draftHasContent && !reviewOpen && (
          <div className="mx-4 mt-2 rounded-xl bg-[var(--color-cell)] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0 text-[13px]">
              <span className="text-white font-medium">Unsaved workout</span>
              <span className="text-[var(--color-secondary)]"> · {draftSetCount} set{draftSetCount === 1 ? '' : 's'} logged</span>
            </div>
            <button type="button" onClick={() => setReviewOpen(true)} className="press text-[14px] font-semibold text-[var(--color-accent)] px-2 py-1">Review log</button>
            <button type="button" onClick={() => setPendingDiscardDraft(true)} className="press text-[14px] text-[var(--color-secondary)] px-1 py-1">Discard</button>
          </div>
        )}
        {view === 'wizard' && (
          <>
            <TodayStrip occurrences={todaysOccurrences} library={library} onStart={calendarHandlers.onStart} onLog={calendarHandlers.onLog} />
            <Wizard onPickConfig={pickPreset} onPickCustom={pickCustom} onPickRotation={pickRotation} />
          </>
        )}
        {view === 'library' && (
          <LibraryView
            items={library}
            folders={folders}
            folderHandlers={folderHandlers}
            onClose={closeLibrary}
            onLoad={(item) => { setScheduledLaunch(null); loadFromLibrary(item); }}
            onLog={openLogForItem}
            onRequestDelete={requestDelete}
            footer={<DataBackup getBackup={getBackup} onImported={onImported} />}
          />
        )}
        {view === 'calendar' && (
          <CalendarView schedule={schedule} journal={journal} library={library} handlers={calendarHandlers} />
        )}
        {view === 'history' && (
          <HistoryView journal={journal} onNew={openAdhocLog} onOpen={openEditLog} onRequestDelete={requestJournalDelete} />
        )}
        {view === 'logEditor' && logDraft && (
          <LogEditorView draft={logDraft} mode={logMode} suggestions={logSuggestions} onSave={saveLog} onCancel={cancelLog} />
        )}
        {view === 'configure' && presetConfig && (
          <ConfigureView
            config={presetConfig}
            blocks={presetBlocks}
            setBlocks={setPresetBlocks}
            onBack={goBackToWizard}
            onStart={startTimer}
            onSave={triggerSave}
          />
        )}
        {view === 'customBuilder' && customSession && (
          <CustomBuilderView
            session={customSession}
            setSession={setCustomSession}
            onBack={goBackToWizard}
            onStart={startTimer}
            onSave={triggerSave}
          />
        )}
        {view === 'rotationBuilder' && rotation && (
          <RotationBuilderView
            rotation={rotation}
            setRotation={setRotation}
            onBack={goBackToWizard}
            onStart={startTimer}
            onSave={triggerSave}
          />
        )}
        {view === 'timer' && session && (
          <TimerView
            session={session}
            onRequestBack={onRequestBack}
            onLogResult={openLogFromTimer}
            onReview={() => setReviewOpen(true)}
            activeLogHasContent={draftHasContent}
            activeLog={activeLog}
            exerciseHistory={exerciseHistory}
            onStartDraft={startActiveDraft}
            onUpdateDraft={persistActiveLog}
          />
        )}
        <SaveDialog open={saveOpen} defaultName={defaultName} onClose={() => setSaveOpen(false)} onSave={saveCurrent} />
        <SavePromptDialog
          open={savePromptOpen}
          originalName={originalName}
          onClose={() => setSavePromptOpen(false)}
          onUpdate={updateCurrent}
          onSaveAsNew={() => { setSavePromptOpen(false); setSaveOpen(true); }}
        />
        <ConfirmDeleteDialog
          open={!!pendingDelete}
          itemName={pendingDelete?.name || ''}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
        <ConfirmDeleteDialog
          open={!!pendingJournalDelete}
          title="Delete this entry?"
          body={<><span className="text-white">{pendingJournalDelete?.sessionName || 'This workout'}</span> will be removed from your history. This can’t be undone.</>}
          onClose={() => setPendingJournalDelete(null)}
          onConfirm={confirmJournalDelete}
        />
        <ReviewLog
          open={reviewOpen}
          draft={activeLog}
          onClose={() => setReviewOpen(false)}
          onSave={finalizeActiveDraft}
          onOpenEditor={() => { setReviewOpen(false); openReviewFromDraft(); }}
          onDiscard={() => { setReviewOpen(false); setPendingDiscardDraft(true); }}
          onNotesChange={(notes) => persistActiveLog({ ...activeLog, notes })}
        />
        <LeaveTimerDialog
          open={pendingTimerBack}
          onClose={() => setPendingTimerBack(false)}
          onReview={() => { setPendingTimerBack(false); setReviewOpen(true); }}
          onKeep={() => { setPendingTimerBack(false); timerBack(); }}
          onDiscard={() => { setPendingTimerBack(false); setDiscardLeavePending(true); setPendingDiscardDraft(true); }}
        />
        <StartWithDraftDialog
          open={pendingStartTimer}
          onClose={() => setPendingStartTimer(false)}
          onReview={() => { setPendingStartTimer(false); setReviewOpen(true); }}
          onDiscardStart={() => { setPendingStartTimer(false); persistActiveLog(null); setPendingOrigin(null); doStartTimer(); }}
        />
        <ConfirmDeleteDialog
          open={pendingDiscardDraft}
          title="Discard workout log?"
          body={<>The sets you logged this workout will be removed. This can’t be undone.</>}
          confirmLabel="Discard"
          onClose={() => setPendingDiscardDraft(false)}
          onConfirm={discardActiveDraft}
        />
      </div>
      {showTabBar && <TabBar active={activeTab} onSelect={selectTab} />}
    </div>
  );
}
