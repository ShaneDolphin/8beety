# 8BEETY — How It Works

The architecture in one sentence: **a pure compiler turns MIDI + your
arrangement into a frame-by-frame register script, and one deterministic chip
engine plays that script everywhere** — live playback, WAV export, and video
export are all the same code path.

## The pipeline

```
        .mid file                    user edits (Zustand store)
            │                                   │
   @tonejs/midi import                          │
            ▼                                   ▼
      Song (normalized) ────────────▶ compile(song, project, profile)
                                                │   pure function, 60 fps frames
                                                ▼
                                          FrameScript
                                   (per-channel typed arrays:
                                  period · volume · duty · pan · trig)
                                                │
              ┌─────────────────────────────────┼──────────────────────────┐
              ▼                                 ▼                          ▼
      AudioWorklet (live)              OfflineAudioContext           Canvas renderer
      ApuCore renders                  same ApuCore → WAV            (Game Boy View +
      samples in realtime              encoder (hand-written)         9:16 video export)
```

## The key modules

| Module | Job |
|---|---|
| `src/engine/midi-import.ts` | MIDI → normalized `Song` (notes, tempo map) |
| `src/engine/compile.ts` | The heart: pure function producing `FrameScript`. Polyphony resolution (top/bottom/arp/split), GM drum mapping, instrument macro rendering, regions, layer modes, per-chip pitch conversion |
| `src/engine/pitch.ts` | Register math for all four chips: NES timers, GB periods, YM2612 fnum/block packing, SPC pitch |
| `src/engine/instruments.ts` | FamiTracker-style macro presets + tweak system |
| `src/engine/chip-profiles.ts` | Channel layouts per chip (what kinds of lanes exist, their ranges) |
| `src/audio/apu-worklet.ts` | All DSP: NES pulse/triangle/noise, GB channels + wave presets, 4-op FM engine, procedural sample bank + SPC voices + echo bus, and `ApuCore`, which walks the script frame-by-frame |
| `src/audio/render.ts` | Offline render (same worklet in an `OfflineAudioContext`) → WAV |
| `src/store.ts` | Zustand store: edits trigger a debounced recompile, hot-swapped into the running worklet without stopping playback |
| `src/viz/` | Game Boy View lane renderer, the drawn console shells (GB/SNES/Genesis), and the MediaRecorder video export |

## Five design decisions worth studying

**1. The frame clock is the contract.** Everything musical is quantized to
60 fps — the clock real console sound drivers ran on. This one decision makes
the whole system deterministic: the same script always produces the same
samples, so exporting is just "render faster than realtime" and testing is
just "assert on the samples."

**2. The compiler is pure.** No global state, no audio APIs, no randomness.
That means hundreds of fast unit tests can pin down every musical behavior
(arpeggio cycling, drum priority, octave clamping with warnings) without ever
opening an AudioContext.

**3. The DSP runs in two worlds on purpose.** `apu-worklet.ts` is loaded as an
AudioWorklet in the browser *and* imported by Vitest under Node. The rule that
makes this possible — no runtime imports, no worklet globals at top level — is
enforced by convention and caught instantly by the test suite. A parity test
proves chunked realtime rendering and whole-file offline rendering are
sample-exact identical.

**4. One register vocabulary for four very different chips.** Square-wave
timers, wavetable periods, FM frequency numbers, and sampler pitch registers
all fit the same five typed arrays. Adding the 16-bit chips changed *what the
numbers mean*, not the shape of the data — so the store, the worklet
transport, the visualizer, and both exporters needed almost no changes.

**5. No assets, no server.** The SNES sample bank is synthesized
deterministically in code (fixed-seed noise, additive synthesis, 8-bit
quantization). Share links compress the entire project — MIDI included — into
the URL fragment with lz-string. The deployed site is static files.

## The video export (a mini-case-study in browser wrangling)

The 9:16 export records the canvas with `captureStream(0)` + explicit
`requestFrame()` while the song's offline-rendered audio plays into a
`MediaStreamDestination`, muxed by MediaRecorder. Hard-won specifics:

- Frame ticks come from a **Web Worker timer**, because hidden browser tabs
  throttle main-thread timers to ≥1/sec — which used to freeze the video while
  audio kept recording.
- Frames are clocked off the **AudioContext's clock**, not wall time, so video
  stays locked to the audio being recorded.
- A **screen wake lock** keeps display sleep from killing multi-minute renders.
- The codec string requests **avc1 at H.264 level 4.0 explicitly**: generic
  "video/mp4" gets VP9-in-MP4 (QuickTime plays audio only), and an
  insufficient level forces a mid-recording parameter change that corrupts the
  file. (avc3 was tested and rejected: QuickTime can't decode it.)

## Testing

~300 Vitest tests, all runnable in Node: register-math round-trips, LFSR
sequences, FM envelope behavior, sample-bank determinism, compiler behaviors
(drum priority, trig emission, octave-fold warnings), layout invariants for
the drawn consoles, and end-to-end smoke tests that compile a two-track song
for every chip and render two seconds of audio, asserting it is non-silent and
within ±1. The suite is the safety net that let an AI assistant refactor
aggressively without regressions.
