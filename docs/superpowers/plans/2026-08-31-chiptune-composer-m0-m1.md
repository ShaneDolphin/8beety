# Chiptune Composer — M0 + M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Context

`/Users/shanemorris/Documents/nessy/app/spec.md` specifies a browser-based tool that converts MIDI files into NES/Game Boy-style chiptune (static Vite/React/TS site, custom AudioWorklet chip emulation, WAV export). The directory currently contains only the spec. The spec mandates milestone-by-milestone execution and its Section 15 explicitly scopes the first session: **execute M0 (scaffold + deployed test tone) and M1 (NES chip engine playing a hardcoded fixture), then stop** — the audio engine must be verified by ear before anything is built on top of it. The user confirmed this scope and confirmed a real Vercel deploy (they will run the interactive `vercel login`).

**Goal:** A deployed Vercel site where a Play button renders a hardcoded 4-bar C-major FrameScript (arpeggio on Pulse 1, bass on Triangle, hat on Noise) through an accurate NES 2A03 sound model, with unit-tested pitch math and LFSR.

**Architecture:** The app is a compiler+player, not a synthesizer. M1 builds the *player* half: an `AudioWorkletProcessor` that latches per-channel register values from a `FrameScript` on a 60 Hz frame clock and renders pulse/triangle/noise via phase accumulators, the NES nonlinear mixer, and a one-pole post-filter chain. The FrameScript for M1 is a hand-built fixture; the compiler comes in M2.

**Tech Stack:** Vite, React 18 + TypeScript strict, Tailwind CSS v4, Vitest, ESLint. No other runtime deps in M0/M1.

**Spec:** `SPEC.md` in the repo root (Task 1 renames `spec.md` → `SPEC.md`). Sections 3, 4.1, 6.3, 9, 12 (M0/M1), 13, 14 govern this plan.

## Global Constraints (from SPEC.md)

- TypeScript strict. No `any`. No default exports except React components.
- Do not add dependencies beyond SPEC.md Section 2's list. Never Tone.js.
- The worklet (`src/audio/apu-worklet.ts`) must not have runtime imports from the rest of the app (`import type` is allowed — it's erased at compile time).
- All timing is 60 fps frames. Never schedule audio events in seconds from the main thread.
- Do not hardcode 44100/48000; read `sampleRate` from the worklet global scope.
- NES mixer formulas verbatim from SPEC.md Section 4.1 (sourced from the NESdev wiki).
- Run `npm test` and `npm run build` before declaring a milestone done.
- Work one milestone at a time. **Do not start M2.** No features from later milestones (no MIDI import, no compiler, no track UI).

## Deviations from the spec (intentional, with reasons)

1. **Worklet loading uses `?worker&url`, not `new URL(...)`.** Vite only detects and bundles `new URL("./x.ts", import.meta.url)` when it appears inside `new Worker(...)`; passed to `audioWorklet.addModule()` it ships raw untranspiled TypeScript in the production build. `import url from "./apu-worklet.ts?worker&url"` bundles the worklet as a separate JS entry — satisfying the spec's real requirement ("served as a separate JS file … not inlined"). Verified against the preview build in Task 2.
2. **Pure DSP exported from the worklet file.** Tests need the LFSR/mixer/oscillators, but the worklet cannot import app code. So `apu-worklet.ts` exports its pure DSP at top level (importable by Vitest under Node) and defines/registers the processor class inside a `typeof AudioWorkletProcessor !== "undefined"` guard so the file imports cleanly in Node.
3. **LFSR test asserts a hand-derived long-mode prefix + measured cycle lengths** (32767 long; 93-or-31 short) rather than an external "known-good" dump, since none is vendored. This still catches any tap/shift mistake.

## File Structure

```
SPEC.md                          (renamed from spec.md)
CLAUDE.md                        Project conventions (spec §14 + worklet-loading note)
docs/superpowers/plans/2026-08-31-chiptune-composer-m0-m1.md   (copy of this plan)
index.html, vite.config.ts, tsconfig*.json, eslint.config.js, package.json
src/main.tsx                     React entry (template)
src/App.tsx                      M0: Play-tone button → M1: fixture transport
src/index.css                    Tailwind import
src/engine/frame-script.ts       FrameScript / ChannelFrames types (spec §6.3)
src/engine/chip-profiles.ts      ChipProfile / ChannelDef types + NES_PROFILE (spec §4.4)
src/engine/pitch.ts              MIDI↔freq↔timer math for NES pulse/triangle
src/engine/fixtures/m1-fixture.ts  buildM1Fixture(): the 4-bar C-major FrameScript
src/audio/worklet-globals.d.ts   Ambient types for AudioWorklet global scope
src/audio/messages.ts            ApuMessage type union (types only, shared both sides)
src/audio/test-tone-worklet.ts   M0 440 Hz sine processor
src/audio/apu-worklet.ts         NES DSP (exported pure) + ApuProcessor (guarded)
src/audio/player.ts              ApuPlayer: AudioContext + worklet node + transport
tests/pitch.test.ts
tests/lfsr.test.ts
tests/dsp.test.ts                mixer, filters, oscillator classes
```

---

### Task 1: Scaffold (M0, part 1)

**Files:**
- Create: entire Vite react-ts scaffold at repo root, `CLAUDE.md`, `docs/superpowers/plans/2026-08-31-chiptune-composer-m0-m1.md`
- Rename: `spec.md` → `SPEC.md`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: working `npm run dev|build|preview|lint`, `npm test` (Vitest), Tailwind active, TS strict, git repo with initial commit.

- [ ] **Step 1: Scaffold Vite into the non-empty directory**

`npm create vite` balks at a non-empty dir, so scaffold into a temp dir and move:

```bash
cd /Users/shanemorris/Documents/nessy/app
npm create vite@latest tmp-scaffold -- --template react-ts
rsync -a tmp-scaffold/ ./ && rm -rf tmp-scaffold
git init && mv spec.md SPEC.md
```

- [ ] **Step 2: Pin React 18 (spec §2), add Tailwind v4 + Vitest**

```bash
npm install react@18 react-dom@18
npm install -D @types/react@18 @types/react-dom@18 tailwindcss @tailwindcss/vite vitest
```

- [ ] **Step 3: Configure Vite + Vitest + Tailwind**

Replace `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

Replace `src/index.css` entirely with:

```css
@import "tailwindcss";
```

Delete `src/App.css` and its import. Add to `package.json` scripts: `"test": "vitest run"`, `"preview": "vite preview"` (keep template's `dev`/`build`/`lint`). In `tsconfig.app.json` confirm `"strict": true` (template default) and set `"include": ["src", "tests"]` so the test files are type-checked and linted with the app code.

- [ ] **Step 4: Minimal App shell**

Replace `src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Chiptune Composer</h1>
      <p className="text-zinc-400 text-sm">M0 scaffold</p>
    </div>
  );
}
```

Remove template logo/assets references from `main.tsx` if any remain.

- [ ] **Step 5: Write smoke test and run it**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test` → PASS. Run: `npm run build` → succeeds. Run: `npm run lint` → clean.

- [ ] **Step 6: Write `CLAUDE.md`** — spec §14 content verbatim, plus under Conventions: `- The worklet is loaded via Vite's \`?worker&url\` import (see SPEC.md §11.1 note); never via new URL(), which ships raw TS.` Copy this plan to `docs/superpowers/plans/2026-08-31-chiptune-composer-m0-m1.md`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + React 18 + TS strict + Tailwind + Vitest (M0)"
```

---

### Task 2: Test-tone worklet (M0, part 2)

**Files:**
- Create: `src/audio/worklet-globals.d.ts`, `src/audio/test-tone-worklet.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `worklet-globals.d.ts` ambient declarations reused by Task 6; the App's lazy-AudioContext-on-click pattern reused in Task 7.

- [ ] **Step 1: Ambient worklet types** — `src/audio/worklet-globals.d.ts`:

```ts
declare const sampleRate: number;
declare const currentFrame: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor & {
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  },
): void;
```

- [ ] **Step 2: Test-tone processor** — `src/audio/test-tone-worklet.ts`:

```ts
class TestToneProcessor extends AudioWorkletProcessor {
  private phase = 0;

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    const inc = (2 * Math.PI * 440) / sampleRate;
    for (let i = 0; i < out.length; i++) {
      out[i] = 0.15 * Math.sin(this.phase);
      this.phase = (this.phase + inc) % (2 * Math.PI);
    }
    return true;
  }
}

registerProcessor("test-tone", TestToneProcessor);
```

- [ ] **Step 3: Wire Play/Stop into App** — replace `src/App.tsx`:

```tsx
import { useRef, useState } from "react";
import testToneUrl from "./audio/test-tone-worklet.ts?worker&url";

export default function App() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(testToneUrl);
      ctxRef.current = ctx;
    }
    const ctx = ctxRef.current;
    if (playing) {
      nodeRef.current?.disconnect();
      nodeRef.current = null;
      setPlaying(false);
    } else {
      await ctx.resume(); // required inside the user gesture (iOS Safari)
      const node = new AudioWorkletNode(ctx, "test-tone");
      node.connect(ctx.destination);
      nodeRef.current = node;
      setPlaying(true);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Chiptune Composer</h1>
      <button
        onClick={() => void toggle()}
        className="rounded bg-emerald-600 px-6 py-2 font-mono hover:bg-emerald-500"
      >
        {playing ? "■ Stop" : "▶ Play 440 Hz"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify dev + production build.** `npm run dev`, open it with the Chrome automation tools, click Play, confirm no console errors and (ask user to confirm audible tone, or check `ctx.state === "running"` via console). Then `npm run build && npm run preview` and repeat against the preview URL — this specifically validates that `?worker&url` emits a working separate JS chunk. Check `dist/assets/` contains a distinct `test-tone-worklet-*.js`.

- [ ] **Step 5: `npm test`, `npm run lint`, commit**

```bash
git add -A && git commit -m "feat: 440 Hz test-tone AudioWorklet with Play button (M0)"
```

---

### Task 3: Vercel deploy (M0 acceptance)

**Files:** none (deployment only).

- [ ] **Step 1: Login (user-interactive).** Ask the user to run `! npx vercel login` in the prompt (the `!` prefix runs it in-session).

- [ ] **Step 2: Deploy**

```bash
npx vercel deploy --prod --yes
```

Vercel auto-detects Vite; no `vercel.json`.

- [ ] **Step 3: Acceptance check.** Open the production URL via Chrome automation, click Play, confirm no console errors and a separate worklet JS request in the network log. Report the URL to the user and ask them to confirm the tone by ear in Chrome, Firefox, and Safari (spec M0 acceptance). **M0 done.**

---

### Task 4: Core types + NES profile + pitch math (M1, part 1)

**Files:**
- Create: `src/engine/frame-script.ts`, `src/engine/chip-profiles.ts`, `src/engine/pitch.ts`
- Test: `tests/pitch.test.ts`

**Interfaces:**
- Produces:
  - `type FrameScript`, `type ChannelFrames` (spec §6.3, verbatim)
  - `NES_PROFILE: ChipProfile` with channels `p1, p2, tri, noise` in that order (DPCM deferred; it's optional in v1)
  - `NES_CPU_HZ = 1789773`
  - `midiToFreq(midi: number): number`
  - `nesPulseTimer(freq: number): number | null` — 11-bit timer, `null` when timer < 8 (authentic silence) or > 2047 (too low)
  - `nesPulseFreq(timer: number): number`
  - `nesTriangleTimer(freq: number): number | null` — `null` only when > 2047
  - `nesTriangleFreq(timer: number): number`

- [ ] **Step 1: Types.** `src/engine/frame-script.ts`:

```ts
export type ChannelFrames = {
  id: string;
  period: Uint16Array; // timer/period register value; 0 = off
  volume: Uint8Array;  // 0–15
  duty: Uint8Array;    // duty index (pulse) / mode bit (noise)
  pan: Uint8Array;     // 0 off, 1 L, 2 R, 3 both (gb); nes always 3
};

export type FrameScript = {
  chip: "nes" | "gb" | "nes-vrc6";
  fps: 60;
  frameCount: number;
  channels: ChannelFrames[];
  barStarts: number[];
};
```

`src/engine/chip-profiles.ts`:

```ts
export type ChannelDef = {
  id: string;
  label: string;
  kind: "pulse" | "triangle" | "noise" | "dpcm" | "wave" | "saw";
  hasVolume: boolean;
  duties?: number[];
  midiRange: [number, number];
  acceptsDrums: boolean;
};

export type ChipProfile = {
  id: "nes" | "gb" | "nes-vrc6";
  name: string;
  stereo: boolean;
  channels: ChannelDef[];
};

const PULSE_DUTIES = [0.125, 0.25, 0.5, 0.75];

export const NES_PROFILE: ChipProfile = {
  id: "nes",
  name: "NES 2A03",
  stereo: false,
  channels: [
    { id: "p1", label: "Pulse 1", kind: "pulse", hasVolume: true, duties: PULSE_DUTIES, midiRange: [33, 115], acceptsDrums: false },
    { id: "p2", label: "Pulse 2", kind: "pulse", hasVolume: true, duties: PULSE_DUTIES, midiRange: [33, 115], acceptsDrums: false },
    { id: "tri", label: "Triangle", kind: "triangle", hasVolume: false, midiRange: [21, 108], acceptsDrums: true },
    { id: "noise", label: "Noise", kind: "noise", hasVolume: true, midiRange: [0, 127], acceptsDrums: true },
  ],
};
```

- [ ] **Step 2: Write failing pitch tests.** `tests/pitch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  midiToFreq, nesPulseFreq, nesPulseTimer, nesTriangleFreq, nesTriangleTimer,
} from "../src/engine/pitch";

describe("midiToFreq", () => {
  it.each([
    [69, 440],
    [60, 261.626],
    [33, 55],
  ])("midi %i → %f Hz", (midi, hz) => {
    expect(midiToFreq(midi)).toBeCloseTo(hz, 2);
  });
});

describe("nes pulse timer", () => {
  it("A4 round-trips through the 11-bit timer with authentic detune", () => {
    const t = nesPulseTimer(440);
    expect(t).toBe(253); // round(1789773 / (16*440) - 1)
    expect(nesPulseFreq(253)).toBeCloseTo(440.4, 1);
  });
  it("silences when timer would be < 8 (very high pitch)", () => {
    expect(nesPulseTimer(14000)).toBeNull(); // timer would be 7
  });
  it("rejects pitches below the 11-bit range", () => {
    expect(nesPulseTimer(50)).toBeNull(); // timer would be 2236 > 2047
  });
  it("boundary: timer exactly 8 is playable", () => {
    // freq where round(cpu/(16f) - 1) === 8  → ~12429 Hz
    expect(nesPulseTimer(12429)).toBe(8);
  });
});

describe("nes triangle timer (32× divider — sounds an octave below pulse at equal timer)", () => {
  it("A2 = 110 Hz", () => {
    const t = nesTriangleTimer(110);
    expect(t).toBe(507); // round(1789773 / (32*110) - 1)
    expect(nesTriangleFreq(507)).toBeCloseTo(110.1, 1);
  });
  it("same timer value sounds one octave lower than pulse", () => {
    expect(nesTriangleFreq(253)).toBeCloseTo(nesPulseFreq(253) / 2, 3);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `npm test` → FAIL (module not found).

- [ ] **Step 4: Implement.** `src/engine/pitch.ts`:

```ts
export const NES_CPU_HZ = 1789773;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function nesPulseTimer(freq: number): number | null {
  const t = Math.round(NES_CPU_HZ / (16 * freq) - 1);
  if (t < 8 || t > 2047) return null;
  return t;
}

export function nesPulseFreq(timer: number): number {
  return NES_CPU_HZ / (16 * (timer + 1));
}

export function nesTriangleTimer(freq: number): number | null {
  const t = Math.round(NES_CPU_HZ / (32 * freq) - 1);
  if (t < 0 || t > 2047) return null;
  return t;
}

export function nesTriangleFreq(timer: number): number {
  return NES_CPU_HZ / (32 * (timer + 1));
}
```

- [ ] **Step 5: `npm test` → PASS. Commit**

```bash
git add -A && git commit -m "feat: FrameScript/ChipProfile types, NES profile, pitch math (M1)"
```

---

### Task 5: Noise LFSR (M1, part 2)

**Files:**
- Modify: create `src/audio/apu-worklet.ts` (pure-DSP portion only; processor comes in Task 6)
- Test: `tests/lfsr.test.ts`

**Interfaces:**
- Produces: `stepLfsr(reg: number, shortMode: boolean): number` exported from `src/audio/apu-worklet.ts`. 15-bit register; feedback = bit0 XOR (bit6 in short mode, else bit1); shift right; feedback into bit 14. Audible output elsewhere is `volume` when `reg & 1` is 0, else 0.

- [ ] **Step 1: Write failing test.** `tests/lfsr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stepLfsr } from "../src/audio/apu-worklet";

function outputs(shortMode: boolean, n: number): number[] {
  let reg = 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(reg & 1);
    reg = stepLfsr(reg, shortMode);
  }
  return out;
}

function cycleLength(shortMode: boolean): number {
  let reg = 1;
  for (let i = 1; i <= 40000; i++) {
    reg = stepLfsr(reg, shortMode);
    if (reg === 1) return i;
  }
  return -1;
}

describe("NES noise LFSR", () => {
  it("long mode: first 16 outputs from seed 1 (hand-derived from bit0^bit1 feedback)", () => {
    expect(outputs(false, 16)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
  it("long mode: maximal 32767-step period, never reaches 0", () => {
    expect(cycleLength(false)).toBe(32767);
    let reg = 1;
    for (let i = 0; i < 32767; i++) {
      reg = stepLfsr(reg, false);
      expect(reg).not.toBe(0);
    }
  });
  it("short mode: short metallic loop (93 or 31 steps), distinct from long mode", () => {
    const len = cycleLength(true);
    expect([93, 31]).toContain(len);
  });
  it("register stays within 15 bits", () => {
    let reg = 1;
    for (let i = 0; i < 1000; i++) {
      reg = stepLfsr(reg, i % 2 === 0);
      expect(reg).toBeLessThan(1 << 15);
      expect(reg).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test tests/lfsr.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Start `src/audio/apu-worklet.ts` (this file grows in Tasks 6–7; no runtime imports, ever):

```ts
// NES 2A03 DSP. This module is loaded both as an AudioWorklet module (via
// ?worker&url) and by Vitest under Node, so it must have no runtime imports
// and must not touch worklet globals at the top level.

export function stepLfsr(reg: number, shortMode: boolean): number {
  const tap = shortMode ? (reg >> 6) & 1 : (reg >> 1) & 1;
  const feedback = (reg & 1) ^ tap;
  return (reg >> 1) | (feedback << 14);
}
```

- [ ] **Step 4: `npm test` → PASS. Commit**

```bash
git add -A && git commit -m "feat: NES noise LFSR with long/short modes (M1)"
```

---

### Task 6: Oscillators, mixer, post-filter (M1, part 3)

**Files:**
- Modify: `src/audio/apu-worklet.ts` (append)
- Test: `tests/dsp.test.ts`

**Interfaces:**
- Produces (all exported from `src/audio/apu-worklet.ts`, all parameterized by `sampleRate` — never reading the global):
  - `NES_CPU_HZ = 1789773`, `PULSE_DUTIES = [0.125, 0.25, 0.5, 0.75]`, `TRI_SEQUENCE: number[]` (32 entries)
  - `class PulseChannel { constructor(sampleRate: number); sample(period: number, volume: number, dutyIndex: number): number }`
  - `class TriangleChannel { constructor(sampleRate: number); sample(period: number, on: boolean): number }`
  - `class NoiseChannel { constructor(sampleRate: number); sample(period: number, volume: number, shortMode: boolean): number }`
  - `nesMix(p1: number, p2: number, tri: number, noise: number, dmc?: number): number`
  - `class OnePoleHighPass { constructor(cutoffHz: number, sampleRate: number); process(x: number): number }`
  - `class OnePoleLowPass { constructor(cutoffHz: number, sampleRate: number); process(x: number): number }`

- [ ] **Step 1: Write failing tests.** `tests/dsp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NoiseChannel, OnePoleHighPass, OnePoleLowPass, PulseChannel,
  TRI_SEQUENCE, TriangleChannel, nesMix,
} from "../src/audio/apu-worklet";

const SR = 48000;

describe("nesMix (NESdev nonlinear mixer)", () => {
  it("is silent at zero input", () => {
    expect(nesMix(0, 0, 0, 0)).toBe(0);
  });
  it("both pulses at 15: 95.88 / (8128/30 + 100)", () => {
    expect(nesMix(15, 15, 0, 0)).toBeCloseTo(0.25848, 4);
  });
  it("triangle at 15: 159.79 / (1/(15/8227) + 100)", () => {
    expect(nesMix(0, 0, 15, 0)).toBeCloseTo(0.24642, 4);
  });
  it("is nonlinear: one pulse at 15 is more than half of two at 15", () => {
    expect(nesMix(15, 0, 0, 0)).toBeGreaterThan(nesMix(15, 15, 0, 0) / 2);
  });
});

describe("PulseChannel", () => {
  it.each([
    [0, 0.125],
    [1, 0.25],
    [2, 0.5],
  ])("duty index %i is high ~%f of the cycle", (dutyIndex, duty) => {
    const ch = new PulseChannel(SR);
    let high = 0;
    const n = 48000;
    for (let i = 0; i < n; i++) if (ch.sample(253, 15, dutyIndex) > 0) high++;
    expect(high / n).toBeGreaterThan(duty - 0.02);
    expect(high / n).toBeLessThan(duty + 0.02);
  });
  it("outputs 0 when period is 0 (off)", () => {
    const ch = new PulseChannel(SR);
    expect(ch.sample(0, 15, 2)).toBe(0);
  });
});

describe("TriangleChannel", () => {
  it("uses the 32-step 4-bit staircase", () => {
    expect(TRI_SEQUENCE).toHaveLength(32);
    expect(Math.max(...TRI_SEQUENCE)).toBe(15);
    expect(Math.min(...TRI_SEQUENCE)).toBe(0);
    expect(TRI_SEQUENCE.slice(0, 4)).toEqual([15, 14, 13, 12]);
  });
  it("emits only values from the sequence", () => {
    const ch = new TriangleChannel(SR);
    for (let i = 0; i < 4096; i++) {
      expect(TRI_SEQUENCE).toContain(ch.sample(507, true));
    }
  });
});

describe("NoiseChannel", () => {
  it("emits either 0 or the given volume", () => {
    const ch = new NoiseChannel(SR);
    const seen = new Set<number>();
    for (let i = 0; i < 4096; i++) seen.add(ch.sample(16, 9, false));
    expect([...seen].sort()).toEqual([0, 9]);
  });
});

describe("post-filters", () => {
  it("high-pass blocks DC", () => {
    const hp = new OnePoleHighPass(90, SR);
    let y = 0;
    for (let i = 0; i < SR; i++) y = hp.process(1);
    expect(Math.abs(y)).toBeLessThan(0.001);
  });
  it("low-pass passes DC", () => {
    const lp = new OnePoleLowPass(14000, SR);
    let y = 0;
    for (let i = 0; i < SR; i++) y = lp.process(1);
    expect(y).toBeCloseTo(1, 3);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test tests/dsp.test.ts` → FAIL.

- [ ] **Step 3: Implement — append to `src/audio/apu-worklet.ts`:**

```ts
export const NES_CPU_HZ = 1789773;
export const PULSE_DUTIES = [0.125, 0.25, 0.5, 0.75];

// 15 14 … 1 0 0 1 … 14 15 (the real 2A03 order)
export const TRI_SEQUENCE = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export class PulseChannel {
  private phase = 0;
  constructor(private readonly sampleRate: number) {}

  sample(period: number, volume: number, dutyIndex: number): number {
    if (period === 0 || volume === 0) return 0;
    const freq = NES_CPU_HZ / (16 * (period + 1));
    this.phase = (this.phase + freq / this.sampleRate) % 1;
    return this.phase < PULSE_DUTIES[dutyIndex] ? volume : 0;
  }
}

export class TriangleChannel {
  private phase = 0;
  constructor(private readonly sampleRate: number) {}

  sample(period: number, on: boolean): number {
    if (!on || period === 0) return 0;
    const freq = NES_CPU_HZ / (32 * (period + 1));
    this.phase = (this.phase + freq / this.sampleRate) % 1;
    return TRI_SEQUENCE[Math.floor(this.phase * 32)];
  }
}

export class NoiseChannel {
  private lfsr = 1;
  private acc = 0;
  constructor(private readonly sampleRate: number) {}

  sample(period: number, volume: number, shortMode: boolean): number {
    if (period === 0 || volume === 0) return 0;
    this.acc += NES_CPU_HZ / period / this.sampleRate;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.lfsr = stepLfsr(this.lfsr, shortMode);
    }
    return (this.lfsr & 1) === 0 ? volume : 0;
  }
}

export function nesMix(p1: number, p2: number, tri: number, noise: number, dmc = 0): number {
  const pulseSum = p1 + p2;
  const pulseOut = pulseSum === 0 ? 0 : 95.88 / (8128 / pulseSum + 100);
  const tnd = tri / 8227 + noise / 12241 + dmc / 22638;
  const tndOut = tnd === 0 ? 0 : 159.79 / (1 / tnd + 100);
  return pulseOut + tndOut;
}

export class OnePoleHighPass {
  private readonly a: number;
  private prevIn = 0;
  private prevOut = 0;
  constructor(cutoffHz: number, sampleRate: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.a = rc / (rc + 1 / sampleRate);
  }
  process(x: number): number {
    const y = this.a * (this.prevOut + x - this.prevIn);
    this.prevIn = x;
    this.prevOut = y;
    return y;
  }
}

export class OnePoleLowPass {
  private readonly b: number;
  private y = 0;
  constructor(cutoffHz: number, sampleRate: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    this.b = dt / (rc + dt);
  }
  process(x: number): number {
    this.y += this.b * (x - this.y);
    return this.y;
  }
}
```

- [ ] **Step 4: `npm test` → PASS (all suites). Commit**

```bash
git add -A && git commit -m "feat: NES oscillators, nonlinear mixer, post-filter (M1)"
```

---

### Task 7: ApuProcessor, player, fixture, playback UI (M1, part 4)

**Files:**
- Create: `src/audio/messages.ts`, `src/audio/player.ts`, `src/engine/fixtures/m1-fixture.ts`
- Modify: `src/audio/apu-worklet.ts` (append processor), `src/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–6.
- Produces:
  - `type ApuMessage` (main→worklet) and `type ApuReport` (worklet→main) in `src/audio/messages.ts`
  - `class ApuPlayer { init(): Promise<void>; load(s: FrameScript): void; play(fromFrame?: number): Promise<void>; pause(): void; seek(frame: number): void; onFrame?: (f: number) => void; onEnded?: () => void }`
  - `buildM1Fixture(): FrameScript`

- [ ] **Step 1: Message types.** `src/audio/messages.ts` (types only — safe for both sides):

```ts
import type { FrameScript } from "../engine/frame-script";

export type ApuMessage =
  | { type: "load"; script: FrameScript }
  | { type: "play"; fromFrame?: number }
  | { type: "pause" }
  | { type: "seek"; frame: number }
  | { type: "setLoop"; loop: [number, number] | null }
  | { type: "hotSwap"; script: FrameScript };

export type ApuReport =
  | { type: "frame"; frame: number }
  | { type: "ended" };
```

- [ ] **Step 2: Processor — append to `src/audio/apu-worklet.ts`.** The class lives inside a guard so importing this file under Node (Vitest) doesn't crash on the undefined `AudioWorkletProcessor` global; `import type` is erased at build time so the module stays runtime-import-free:

```ts
import type { ApuMessage, ApuReport } from "./messages";
import type { FrameScript } from "../engine/frame-script";
```

(these two lines go at the very top of the file)

```ts
if (typeof AudioWorkletProcessor !== "undefined") {
  class ApuProcessor extends AudioWorkletProcessor {
    private script: FrameScript | null = null;
    private playing = false;
    private frame = 0;
    private samplesUntilFrame = 0;
    private loop: [number, number] | null = null;
    private framesSinceReport = 0;
    private readonly pulse1 = new PulseChannel(sampleRate);
    private readonly pulse2 = new PulseChannel(sampleRate);
    private readonly tri = new TriangleChannel(sampleRate);
    private readonly noise = new NoiseChannel(sampleRate);
    private readonly hp90 = new OnePoleHighPass(90, sampleRate);
    private readonly hp440 = new OnePoleHighPass(440, sampleRate);
    private readonly lp14k = new OnePoleLowPass(14000, sampleRate);

    constructor() {
      super();
      this.port.onmessage = (e: MessageEvent<ApuMessage>) => this.onMessage(e.data);
    }

    private onMessage(msg: ApuMessage): void {
      switch (msg.type) {
        case "load":
          this.script = msg.script;
          this.frame = 0;
          this.samplesUntilFrame = sampleRate / 60;
          break;
        case "play":
          if (msg.fromFrame !== undefined) this.frame = msg.fromFrame;
          this.samplesUntilFrame = sampleRate / 60;
          this.playing = true;
          break;
        case "pause":
          this.playing = false;
          break;
        case "seek":
          this.frame = msg.frame;
          this.samplesUntilFrame = sampleRate / 60;
          break;
        case "setLoop":
          this.loop = msg.loop;
          break;
        case "hotSwap":
          this.script = msg.script;
          if (this.frame >= msg.script.frameCount) this.frame = 0;
          break;
      }
    }

    private post(report: ApuReport): void {
      this.port.postMessage(report);
    }

    private advanceFrame(): void {
      this.frame++;
      if (this.loop && this.frame >= this.loop[1]) this.frame = this.loop[0];
      if (this.script && this.frame >= this.script.frameCount) {
        this.playing = false;
        this.frame = 0;
        this.post({ type: "ended" });
        return;
      }
      if (++this.framesSinceReport >= 4) {
        this.framesSinceReport = 0;
        this.post({ type: "frame", frame: this.frame });
      }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const out = outputs[0][0];
      if (!this.script || !this.playing) {
        out.fill(0);
        return true;
      }
      const [p1c, p2c, tric, noisec] = this.script.channels;
      for (let i = 0; i < out.length; i++) {
        if (this.samplesUntilFrame <= 0) {
          this.advanceFrame();
          this.samplesUntilFrame += sampleRate / 60;
          if (!this.playing) {
            out.fill(0, i);
            return true;
          }
        }
        this.samplesUntilFrame -= 1;
        const f = this.frame;
        const s1 = this.pulse1.sample(p1c.period[f], p1c.volume[f], p1c.duty[f]);
        const s2 = this.pulse2.sample(p2c.period[f], p2c.volume[f], p2c.duty[f]);
        const st = this.tri.sample(tric.period[f], tric.volume[f] > 0);
        const sn = this.noise.sample(noisec.period[f], noisec.volume[f], noisec.duty[f] === 1);
        const mixed = nesMix(s1, s2, st, sn);
        out[i] = this.lp14k.process(this.hp440.process(this.hp90.process(mixed)));
      }
      return true;
    }
  }

  registerProcessor("apu", ApuProcessor);
}
```

- [ ] **Step 3: Player.** `src/audio/player.ts`:

```ts
import apuWorkletUrl from "./apu-worklet.ts?worker&url";
import type { FrameScript } from "../engine/frame-script";
import type { ApuMessage, ApuReport } from "./messages";

export class ApuPlayer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  onFrame?: (frame: number) => void;
  onEnded?: () => void;

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(apuWorkletUrl);
    this.node = new AudioWorkletNode(this.ctx, "apu", { outputChannelCount: [1] });
    this.node.port.onmessage = (e: MessageEvent<ApuReport>) => {
      if (e.data.type === "frame") this.onFrame?.(e.data.frame);
      else if (e.data.type === "ended") this.onEnded?.();
    };
    this.node.connect(this.ctx.destination);
  }

  load(script: FrameScript): void {
    this.post({ type: "load", script });
  }

  async play(fromFrame?: number): Promise<void> {
    await this.ctx?.resume(); // must happen inside a user gesture
    this.post({ type: "play", fromFrame });
  }

  pause(): void {
    this.post({ type: "pause" });
  }

  seek(frame: number): void {
    this.post({ type: "seek", frame });
  }

  private post(msg: ApuMessage): void {
    this.node?.port.postMessage(msg);
  }
}
```

- [ ] **Step 4: Fixture (spec M1: C-major arpeggio on Pulse 1 at 1 frame/step, root on triangle, closed hat on noise, 4 bars).** `src/engine/fixtures/m1-fixture.ts`:

```ts
import type { ChannelFrames, FrameScript } from "../frame-script";
import { midiToFreq, nesPulseTimer, nesTriangleTimer } from "../pitch";

// 120 BPM, 4/4: one beat = 30 frames, one bar = 120 frames, 4 bars = 480 frames.
const FRAME_COUNT = 480;

function emptyChannel(id: string): ChannelFrames {
  return {
    id,
    period: new Uint16Array(FRAME_COUNT),
    volume: new Uint8Array(FRAME_COUNT),
    duty: new Uint8Array(FRAME_COUNT),
    pan: new Uint8Array(FRAME_COUNT).fill(3),
  };
}

export function buildM1Fixture(): FrameScript {
  const p1 = emptyChannel("p1");
  const p2 = emptyChannel("p2");
  const tri = emptyChannel("tri");
  const noise = emptyChannel("noise");

  // Pulse 1: C4-E4-G4 arpeggio, one frame per step, 50% duty (index 2).
  const arp = [60, 64, 67].map((m) => nesPulseTimer(midiToFreq(m)) ?? 0);
  for (let f = 0; f < FRAME_COUNT; f++) {
    p1.period[f] = arp[f % 3];
    p1.volume[f] = 11;
    p1.duty[f] = 2;
  }

  // Triangle: C2 root, gated 24 frames on / 6 off each beat.
  const rootTimer = nesTriangleTimer(midiToFreq(36)) ?? 0;
  for (let f = 0; f < FRAME_COUNT; f++) {
    if (f % 30 < 24) {
      tri.period[f] = rootTimer;
      tri.volume[f] = 15;
    }
  }

  // Noise: closed hat on every 8th note (15 frames), fast decay, bright period.
  const hat = [8, 4, 1, 0];
  for (let start = 0; start < FRAME_COUNT; start += 15) {
    for (let i = 0; i < hat.length && start + i < FRAME_COUNT; i++) {
      noise.period[start + i] = 16;
      noise.volume[start + i] = hat[i];
      noise.duty[start + i] = 0; // long mode
    }
  }

  return {
    chip: "nes",
    fps: 60,
    frameCount: FRAME_COUNT,
    channels: [p1, p2, tri, noise],
    barStarts: [0, 120, 240, 360],
  };
}
```

- [ ] **Step 5: Wire the fixture into App** — replace `src/App.tsx` (drops the test-tone UI; the test-tone worklet file stays for reference):

```tsx
import { useRef, useState } from "react";
import { ApuPlayer } from "./audio/player";
import { buildM1Fixture } from "./engine/fixtures/m1-fixture";

export default function App() {
  const playerRef = useRef<ApuPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);

  async function toggle() {
    if (!playerRef.current) {
      const player = new ApuPlayer();
      await player.init();
      player.load(buildM1Fixture());
      player.onFrame = setFrame;
      player.onEnded = () => setPlaying(false);
      playerRef.current = player;
    }
    if (playing) {
      playerRef.current.pause();
      setPlaying(false);
    } else {
      await playerRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Chiptune Composer</h1>
      <p className="text-zinc-400 text-sm">M1: NES fixture — C major arp / tri bass / noise hat</p>
      <button
        onClick={() => void toggle()}
        className="rounded bg-emerald-600 px-6 py-2 font-mono hover:bg-emerald-500"
      >
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <p className="font-mono text-xs text-zinc-500">
        frame {frame} / 480 · bar {Math.floor(frame / 120) + 1}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verify.** `npm test` (all suites PASS), `npm run lint`, `npm run build`. Then `npm run dev`, open in Chrome via automation, click Play: no console errors, frame counter advances 0→480 over 8 seconds, playback stops at the end. Then `npm run build && npm run preview` and repeat once against the preview build.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: APU worklet processor, player, M1 fixture playback (M1)"
```

---

### Task 8: Deploy + M1 acceptance

**Files:** none.

- [ ] **Step 1: Deploy** — `npx vercel deploy --prod --yes`.

- [ ] **Step 2: Verify from the production URL** via Chrome automation: Play works, frame counter runs, no console errors, worklet loads as its own JS file.

- [ ] **Step 3: By-ear acceptance (user).** Report the URL and ask the user to confirm the M1 acceptance criterion: the fixture sounds unmistakably like an NES — shimmering fast arpeggio (the 20 Hz chord illusion), round hollow triangle bass, crisp noise hat. Suggest comparing against a FamiTracker export of the same pattern if they have one. Flag anything that sounds wrong (buzzing = mixer bug, wrong pitch = timer math, clicks = frame-clock bug) for a systematic-debugging pass. **M1 done. Stop — do not start M2.**

---

## Verification (end-to-end)

1. `npm test` — pitch (round-trip, silence threshold, triangle octave), LFSR (prefix + periods), DSP (mixer values, duty ratios, filters) all green.
2. `npm run lint && npm run build` — clean, `dist/assets/` contains a separate `apu-worklet` chunk.
3. Local: dev server and preview build both play the fixture with a running frame counter and zero console errors (checked via Chrome automation).
4. Production: same checks against the Vercel URL; user confirms tone (M0) and NES character (M1) by ear in Chrome, Firefox, and Safari.

## Out of scope (explicitly deferred)

- M2+: MIDI import, compiler, polyphony, track UI, Game Boy profile, export/share, Chord Assist.
- Spec §16 open decisions (project name, coffee-link provider, arranged-MIDI export, VRC6) are due **before M2**, not now.
- DPCM channel (optional in v1) — profile omits it; add in M3 with drums if wanted.
