# Chiptune Composer — M2 Implementation Plan (MIDI in, sound out)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Drop a multi-track GM MIDI file and hear it through the NES profile within 2 seconds; change BPM live within 100 ms; `compile()` snapshot-tested on 3 fixture MIDIs. (SPEC.md §12 M2.)

**Architecture:** `parseMidi()` normalizes a MIDI file into `Song`; `autoArrange()` builds the initial `Project`; `compile(song, project, profile)` (pure) resolves timing, top/bottom polyphony, and instrument macros into a `FrameScript`; a Zustand store debounce-recompiles (~50 ms) on every project edit and `hotSwap`s the running worklet. UI: full-page drop zone, header (BPM + transport), minimal track list.

**Spec:** SPEC.md §5 (instruments), §6 (data model), §7.1–7.2 + top/bottom of §7.3 (compiler), §12 M2. Out of scope (M3+): arp/split polyModes, GM drum map, layer modes, regions, rack drag-and-drop.

**New deps (both in SPEC §2):** `@tonejs/midi`, `zustand`.

## Global constraints
Same as M0/M1 plan (TS strict, worklet import rules, 60 fps frames, test+build per milestone). Compiler must be pure — no global reads.

## Decisions locked here
- **Drums in M2:** drum tracks are imported and listed but left unassigned by auto-arrange (GM drum map is M3). Melodic content plays.
- **polyMode:** type carries all four values; M2 compiler implements `top`/`bottom` and treats `arp`/`split` as `top` (documented; M3 replaces).
- **Retrigger semantics:** whenever the selected note identity changes (new note-on, or a note ending reveals another), instrument macros restart from frame 0. Selected→none plays the instrument's `release` macro (if any) at the last period for `values.length` frames, else cuts.
- **Track volume:** scales macro volume: `round(macroVol * track.volume / 15)`.
- **"One octave down" presets** (Pulse Bass) use `arpeggio: { values: [-12] }` (hold) rather than a new field.
- **Slot conflicts:** compiler processes tracks in order; a later track writing an occupied slot overwrites and emits a warning (UI prevents this anyway).
- **Snapshot format:** run-length-encoded per-channel `period`/`volume`/`duty` arrays plus frameCount/barStarts — precise but readable.
- **Fixture MIDIs:** built in-memory with `@tonejs/midi` inside the test file (deterministic bytes → parse → compile → snapshot), covering melody+bass, block chords (bottom-mode extraction), and tempo-mapped input.
- **Demo file:** `scripts/make-demo-midi.mjs` generates `public/demo-midis/demo.mid` (self-composed 8-bar I–V–vi–IV, melody/chords/bass/drums) once, committed; the empty state gets a "Load demo" button (part of §10.1's drop-zone spec, and required for browser-automation acceptance).

## File structure
```
src/engine/song.ts          Song / SourceTrack / Note types (§6.1)
src/engine/midi-import.ts   parseMidi(data: Uint8Array, fileName: string): Song
src/engine/instruments.ts   Macro/Instrument types, macroValue(), PRESETS, presetsForKind()
src/engine/project.ts       Project / TrackArrangement / Region types (§6.2), defaultProject(song)
src/engine/auto-arrange.ts  autoArrange(song): { tracks; assignedCount }
src/engine/compile.ts       compile(song, project, profile): { script; warnings }
src/store.ts                Zustand store; debounced compile → player.hotSwap
src/audio/player.ts         + hotSwap(script) method
src/components/{Header,TrackList,EmptyState}.tsx
src/App.tsx                 layout + global drop handling
scripts/make-demo-midi.mjs  writes public/demo-midis/demo.mid
tests/{midi-import,instruments,compile}.test.ts
```

## Key interfaces
```ts
// song.ts (§6.1 verbatim)
type Note = { tick: number; durationTicks: number; midi: number; velocity: number };
type SourceTrack = { index: number; name: string; midiChannel: number; program?: number;
  isDrums: boolean; notes: Note[]; maxPolyphony: number; pitchRange: [number, number] };
type Song = { name: string; ppq: number; originalBpm: number;
  tempoMap: { tick: number; bpm: number }[]; timeSignature: [number, number];
  durationTicks: number; tracks: SourceTrack[] };

// instruments.ts (§5)
type Macro = { values: number[]; loop?: number };
type Instrument = { id: string; name: string; kinds: ChannelDef["kind"][];
  volume: Macro; arpeggio?: Macro; pitch?: Macro; duty?: Macro;
  wave?: number[]; noiseMode?: "long" | "short"; release?: Macro };
function macroValue(m: Macro, frame: number): number; // loop from index, else hold last

// compile.ts
type CompileWarning = { trackId: string; message: string };
function compile(song: Song, project: Project, profile: ChipProfile):
  { script: FrameScript; warnings: CompileWarning[] };
```
Presets (M2 set): Square Lead (duty 2, vibrato pitch macro after 20 frames), Thin Lead (duty 1),
Nasal Lead (duty 0), Pluck (duty 1, vol 15 11 8 6 4 3 2 1 0), Brass (duty macro 0 0 1 1 2 2 2 hold,
vol swell), Echo Lead (= Square Lead), Tri Bass (gate hold), Tri Pluck (gate 8 frames), Pulse Bass
(duty 0, −12 arp, short decay).

## Tasks
- [ ] **1. Deps + Song + midi-import (TDD).** `npm i @tonejs/midi zustand`. Tests: ppq/tempo/duration mapping; velocity 0–1→0–127; channel-9 and name-regex drum detection; maxPolyphony (overlapping notes); pitchRange; empty tracks skipped; type-0 file (single track) works. Commit.
- [ ] **2. Instruments (TDD).** Tests: macroValue hold, loop wrap, loop-at-0; Pluck decays to 0; presetsForKind("pulse") excludes Tri Bass. Commit.
- [ ] **3. Project + auto-arrange (TDD).** Heuristic (§10.1, minus arp step): highest-mean-pitch low-poly melodic → p1/Square Lead/top; next melodic → p2/Thin Lead/top; lowest-mean-pitch non-drum → tri/Tri Bass/bottom; drums + rest unassigned. Every source track gets a TrackArrangement (volume 15, octaveShift 0). Tests on hand-built Songs. Commit.
- [ ] **4. Compiler (TDD).** Timing (flatten + scale), frame rounding from absolute seconds, min-1-frame notes, barStarts; top/bottom selection with retrigger; octave clamping + warnings; macro walk (volume/duty/arp/pitch/release); mute/solo; slot writing. Unit tests: note at beat 1 @120 BPM → frame 30; top vs bottom on overlapping notes; retrigger on reveal; clamp warning counts; solo drops others; BPM 240 halves frames. Snapshot tests on 3 in-memory fixture MIDIs (RLE digest). Commit.
- [ ] **5. Store + player + demo.** `hotSwap()` on ApuPlayer; Zustand store with loadMidi/updateProject/updateTrack/play/pause/stop; 50 ms debounced recompile → hotSwap (dev-log compile ms); demo generator script + committed demo.mid. Commit.
- [ ] **6. UI.** EmptyState (drop hint + Load demo + file picker), global drag-drop, Header (name, BPM number input 40–300 with original-tempo placeholder/reset/shift-arrow±10, ⏮ ▶⏸, bar·frame readout), TrackList rows (name, poly badge, slot/instrument/polyMode selects, M/S, unassigned/clamp warning icons). Commit.
- [ ] **7. Verify + deploy.** `npm test && npm run lint && npm run build`; browser: load demo → plays; measure drop→sound; BPM change while playing (<100 ms); mute/solo; instrument swap live; console clean. Deploy, verify prod, report.

## Verification (acceptance, §12 M2)
1. Multi-track GM MIDI plays through NES profile < 2 s from load.
2. BPM edits audible within 100 ms while playing (50 ms debounce + hotSwap).
3. `compile()` snapshot-covered on 3 fixture MIDIs; all unit suites green.
