# Interval Trainer — Handoff

A mobile-first PWA for interval-based lifting workouts. Built as a personal-use tool, deployed via GitHub Pages.

- **Live URL:** https://newcomerd33-wq.github.io/interval-trainer/
- **Repo:** https://github.com/newcomerd33-wq/interval-trainer
- **Local path:** `C:\Users\dylan\Desktop\interval-trainer`
- **Latest production commit at handoff time:** `84bdc48`

---

## Quickstart

```bash
cd C:\Users\dylan\Desktop\interval-trainer
npm install              # one-time
npm run dev              # local dev at http://localhost:5173
npm run build            # production build → dist/
git push origin main     # auto-deploys via GitHub Actions (~30s)
```

The deploy workflow is in `.github/workflows/deploy.yml`. Every push to `main` triggers a build + deploy to GitHub Pages.

iOS Safari caches *aggressively*. To verify a new build is live on iPhone:
- Hard refresh (pull down on address bar)
- Or: Settings → Safari → Advanced → Website Data → delete `newcomerd33-wq.github.io`
- Or for the home-screen PWA: long-press icon → Remove → re-add from Safari

To confirm which build is live in a browser, inspect the deployed HTML for `assets/index-*.js` and compare against `npm run build` output locally.

---

## What this app does

User-facing flow:

1. **Wizard** (default entry point) walks you through duration → interval style → base interval → composition → matching presets, then lets you pick a session
2. **Custom timer** lets you build arbitrary circuits with per-exercise durations, rounds per circuit, and rest between circuits
3. **Primary + accessories** builds an A-B-A-C rotation (primary alternates with N rotating accessories, dictated by sequence-rounds)
4. **Saved library** keeps anything you save in `localStorage` for one-tap reuse
5. **Timer** runs any session type — circular progress ring, big countdown, audio cues at 10s / 3-2-1 / transition / halfway / complete

---

## Tech stack

- **Vite 6** — build tool, dev server
- **React 18** — UI
- **Tailwind v4** — styling (config in `src/index.css` via `@theme`)
- **lucide-react** — icons
- **System fonts** via `-apple-system` (real SF Pro on iPhone)
- **localStorage** — saved sessions
- **Web Audio API** — all sound cues
- **GitHub Pages** — hosting (no backend)

No backend. No database. No auth. The app is fully static — anything stored stays in the user's browser.

---

## File structure

```
interval-trainer/
├── .github/workflows/deploy.yml   # auto-deploy on push to main
├── public/
│   ├── manifest.webmanifest       # PWA manifest
│   ├── icon-*.png, apple-touch-icon.png, favicon-32.png
│   └── icon.svg                   # source for icon generator
├── scripts/
│   └── generate-icons.mjs         # rasterizes SVG → PNGs via sharp
├── src/
│   ├── App.jsx                    # ENTIRE APP — ~1800 lines, everything is here
│   ├── index.css                  # Tailwind + theme tokens + animations
│   ├── main.jsx                   # React mount
│   └── assets/sounds/
│       ├── go.mp3                 # boxing bell start
│       ├── end.mp3                # boxing bell end
│       └── complete.mp3           # 3-strike bell finale
├── index.html                     # PWA meta + viewport tags
├── package.json
├── vite.config.js                 # base: './' for path portability
└── README.md
```

**`App.jsx` is monolithic by design.** Sections are clearly demarcated with `// ==========` banners. Splitting it would add friction for an experimental personal project. If it crosses ~2500 lines, consider extracting `src/audio.js`, `src/data.js`, and `src/components/`.

---

## Major systems

### 1. Session model — the timer's universal interface

`TimerView` accepts a unified `session` object:

```js
{
  type: 'preset' | 'custom' | 'rotation',
  slots: [{ name, duration, side?, alternating?, combined?, unilateral?, isRest?, meta?: {...} }],
  totalSets: number,
  totalDurationSec: number,
  durationMin: number,
  metaLine: string,
}
```

Three builders produce this shape:

- **`buildPresetSession(config, blocks)`** — for preset configs (uniform / asymmetric). Blocks are user-edited (B / A / U types). Slots are expanded across all rounds at session-start time, not per-round, so the timer iterates a flat list.
- **`buildCustomSession(custom)`** — for the free-form custom builder. Walks circuits → rounds → exercises, interleaves rest slots between circuits.
- **`buildRotationSession(rot)`** — for primary + accessories. Total slots = `rounds × 2 × accessoryCount`. Primary fills even slots, accessories cycle through odd slots.

### 2. Audio cue system (in App.jsx, AUDIO section)

**Sampled cues** (real MP3s loaded via Vite `?url` imports + `decodeAudioData`):
- `go` (boxing bell start) — plays at round transitions; also as the GO at start of session
- `end` (boxing bell end) — used for the halfway switch cue in combined-U slots
- `complete` (3-strike bell) — session finish; truncated to 2 dings via `maxDuration: 2.1, fadeOut: 0.2`

`playSample(key, { gain, rate, maxDuration, fadeOut, delay })` wraps `AudioBufferSourceNode` with envelope and trim support.

**Synthesized cues** (via Web Audio):
- `crack({ freq, q, decay, gain, type })` — filtered white-noise burst → snare-crack / woodblock / hi-hat texture depending on params
- `thump({ start, end, decay, gain })` — kick-drum-like sine sweep
- `blip({ freq, decay, gain, wave })` — clean tonal pulse
- `beep({ freq, duration, gain, cutoff })` — sine+square through a low-pass for warm-but-loud beeps (used by `warning10sec` and `preTick`)

Cue calls:
- `cues.preTick(n)` — 740 Hz warm beep, fired at secondsLeft = 4/3/2 (= when countdown displays 3/2/1)
- `cues.warning10sec()` — single 440 Hz longer beep at 10s remaining
- `cues.transition()` — round bell sample at 1.4× gain, 0.9× rate; fires at every slot change (not just session start)
- `cues.halfway()` — end-bell sample, fires at midpoint of combined-U slots
- `cues.enterRest()` — soft synth pad; fires when entering a rest slot in custom sessions
- `cues.complete()` — truncated 3-strike bell

**iOS audio ducking:** `navigator.audioSession.type = 'transient'` is set when the AudioContext is created. On iOS 16.4+, this asks the OS to briefly attenuate other audio (Spotify, Apple Music) when our cues play. Falls through silently on browsers that don't support it.

### 3. localStorage library

Storage key: `interval-trainer-library-v1`

Three item shapes:
```js
// preset
{ id, savedAt, name, sourceType: 'preset', configId, blocks: [{type, name}, ...] }
// custom
{ id, savedAt, name, sourceType: 'custom', custom: { circuits: [...] } }
// rotation
{ id, savedAt, name, sourceType: 'rotation', rotation: { intervalSec, rounds, primary, accessories } }
```

LibraryView shows all saved items with type-aware subtitles. Each row has an inline trash icon → confirm dialog → delete. Tap the row body to load (jumps to the appropriate builder view with state populated).

When a session was loaded from the library, the app tracks `loadedFromId`. The Save button then opens a 3-button prompt instead of the name dialog: `Update [name]` / `Save as new` / `Cancel`. Update overwrites in place keeping the same id and name.

### 4. iOS keyboard-aware save dialog

The save dialog is *not* a bottom sheet (those get covered by the iPhone keyboard). It's a centered iOS-style alert anchored at `top: calc(env(safe-area-inset-top) + 56px)` — high enough on the screen that the keyboard physically can't reach it. Belt-and-suspenders: also calls `scrollIntoView({ block: 'center' })` 50ms and 400ms after the dialog opens.

### 5. Block types in preset sessions

- **B** (Bilateral) — single slot, no side label
- **A** (Alternating L/R) — single slot, behaves like B for timing; just a label so the user knows to alternate reps
- **U** (Unilateral per-side) — two slots (Left, then Right) in *uniform* style; one extended slot (base + 30s) in *asymmetric* style

The B↔A toggle is per-block in the Configure view (tap the type label). U blocks can't be toggled; their behavior depends on the parent config's style.

### 6. Preset config library

In `App.jsx`:
- `UNIFORM_TEMPLATES` — 58 `[durationMin, intervalSec, slots, sets]` tuples
- `mixesFor(slots)` — expands each template into B+U combinations → 172 uniform configs
- `asymConfigs()` — generates 128 asymmetric configs by walking valid (duration, base interval, b, u, rounds) combinations where `b*base + u*(base+30) == round_seconds` and `rounds × cycle == duration_seconds`

Total: 300 preset configs. `CONFIGS = [...uniform, ...asymmetric]` and `CONFIG_BY_ID` for O(1) lookup.

---

## State machine in `App`

Views: `'wizard' | 'library' | 'configure' | 'customBuilder' | 'rotationBuilder' | 'timer'`

Mode: `null | 'preset' | 'custom' | 'rotation'` — used to drive `TimerView` back-navigation and `saveCurrent`/`updateCurrent` branching.

Each `pick*` handler clears the other modes' state to prevent stale data leaking across sessions. Going back to the wizard via `goBackToWizard` clears `loadedFromId` so the next save creates a new entry.

---

## Audio licensing — IMPORTANT

The current bell samples are personal-use only:

- **SoundBible boxing bells** (`go.mp3`, `end.mp3`) — "Personal Use Only" license
- **Orange Free Sounds** completion bell (`complete.mp3`) — CC BY-NC 4.0 (non-commercial, attribution)

This is fine for a personal-use PWA. **If you ever decide to ship publicly or commercially**, swap to Mixkit's free-for-commercial bells or Pixabay's royalty-free pool, both of which have no attribution requirements.

---

## User preferences (captured from real iteration)

The user iterated extensively on aesthetics and audio. Things to respect:

**Visual**
- Hates "AI app" tells: gradient backgrounds, floating cards-on-cards, oversized hero typography, uppercase tracking-widest labels, eyebrow text everywhere
- Prefers iOS-native: system fonts, grouped list rows with hairline dividers, restrained color usage (one accent), 17pt body text
- A "cinematic depth" pass (animated gradient backgrounds, glow effects on the ring, completion burst) was built and reverted — kept only what was minimal-iOS-native
- Wizard typography sizing should stay around 28px headings, not bigger

**Audio**
- Doesn't want tap sounds on UI elements — only workout cues
- Doesn't want TTS / voice announcements
- Wants loud sounds that cut through music (Spotify) — sine+square through low-pass works, square+saw alone is too harsh
- Likes "boxing gym" energy (real bells, kick-drum thumps) over "wellness chime" energy (FM bells, soft tones)
- Specifically dislikes "doot doot" and ascending-pitch ticks — wants a single clear beep
- The 10s warning + 3-2-1 countdown + bell-at-every-transition cadence was an explicit ask

**UX**
- Doesn't want long lists to scroll through — preferred a wizard
- Wants tap-to-replace input behavior (`onFocus={e => e.target.select()}`) on every name field
- Custom builder needs duration-customizable per exercise, not just preset
- Saved sessions need both update and save-as-new options when loaded
- Library deletion needs to be visible (not buried in Edit mode)

---

## Revert workflow

The user has invoked manual rollback before. The pattern:

```bash
cd C:\Users\dylan\Desktop\interval-trainer
git reset --hard <commit-sha>
git push --force origin main
```

Force-pushing to `main` is normally a yellow flag, but it's intentional here (small personal repo, single contributor, deliberately discarding work). Always confirm with the user before force-pushing.

Most recent named revert anchor was `3837859` (pre-cinematic-depth experiment).

---

## Known issues / open items

- **No cross-device sync.** localStorage is per-browser, per-origin. Cross-device would require a backend or iCloud KV (out of scope for now).
- **iOS PWA caching.** Aggressive enough that the user sometimes thinks new builds aren't deployed. Hard refresh + clear site data resolves it.
- **Audio licensing not commercial-safe** (see above).
- **No workout history** — the app times sessions but doesn't record what was completed.
- **No reduced-motion fallback** — the iOS-native look has minimal motion anyway, but the `prefers-reduced-motion` media query isn't honored for the few transitions that exist.
- **Audio Session API support** is uneven — works on iOS 16.4+ Safari, Chromium 116+ (behind a flag in some versions), not Firefox. Wrapped in try/catch.

---

## Future ideas (proposed but not built)

Roughly ordered by impact-per-effort:

1. **Quick-start last session** — top button on wizard's first screen to jump straight to the most recently used session
2. **Workout history log** — record completed sessions to localStorage; show streaks, totals, recent activity
3. **Pin favorites** — star saved library items to keep them at the top
4. **Export / import library as JSON** — backup safety net for when iOS clears site data
5. **Shareable URLs** — encode a session into a URL hash so it can be sent to a training partner; opens directly to that config
6. **Random session** — surprise-me button
7. **Big-screen / landscape mode** — countdown fills the viewport for reading from across the gym
8. **Voice-memo cues** — record a 2-second voice clip per exercise, plays at transition (stored as base64 in localStorage)
9. **Apple Watch companion** — native app territory; haptics + wrist countdown would be the killer use case
10. **iCloud sync** — would need a small backend (Cloudflare KV / D1 free tier would do)

---

## Common debugging notes

- **"Audio isn't loud enough":** check `playSample` gain on the cue call. Boxing bells are at 1.4× gain currently. Beeps run through a tanh waveshaper for soft-clipping; raise the `gain` param if needed.
- **"Sound is too harsh":** lower the beep `cutoff` (currently 2200 Hz for preTick, 1600 Hz for warning10sec) — lower = warmer.
- **"Save dialog covered by keyboard":** confirmed fixed on iOS by anchoring at `top: 56px` instead of bottom-sheet position. Don't reintroduce a bottom sheet for inputs.
- **"New build not showing":** see iOS caching notes above. Check the deployed HTML's `index-*.js` hash against local build output.
- **Build fails with "module not found":** check Vite asset import paths. `?url` imports must resolve to actual files. Make sure new MP3s are under `src/assets/` not `public/`.

---

## Conventions

- Pure CSS animations via keyframes in `index.css`, not framer-motion
- All state in App-level `useState`; no Redux/Zustand
- Refs (`useRef`) for things that shouldn't trigger re-render (audio buffer load flag, mid-cue fired flag)
- `key={someValue}` to force remount + animation replay on countdown digits
- Names are user-controlled (always editable inputs with `onFocus={e => e.target.select()}`)
- Numbers use `font-variant-numeric: tabular-nums` via the `.tabular` class

---

## Contact / context

Built collaboratively with the user (Dylan, newcomerd33@gmail.com / GitHub `newcomerd33-wq`) over many iterative sessions. The conversation history captures most product decisions and rejected alternatives — preserve it if possible when picking this back up.
