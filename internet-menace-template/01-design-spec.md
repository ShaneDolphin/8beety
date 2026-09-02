# 8BEETY — Design Specification (Condensed)

This is the condensed form of the specification the application was built from.
The full working spec lives in the repo as `SPEC.md` (about 630 lines), plus two
follow-on design docs under `docs/superpowers/specs/`. Everything below was
written **before** the corresponding code.

## 1. Product statement

A browser-based tool that turns any MIDI file into music that sounds like it
came out of an NES, a Game Boy, a Super Nintendo, or a Sega Genesis. Drop in a
MIDI, set a tempo, assign tracks to chip channels, swap instruments, export a
WAV or a 9:16 video. No login, no server — hosted as a static site.

**Guiding principle:** this app is not a synthesizer that receives MIDI notes.
It is a **compiler** that takes a MIDI file plus an arrangement and produces a
frame-by-frame register script for a chip model, plus a **player** that renders
that script. Everything downstream of the compiler is deterministic — which
makes WAV export trivial and testing easy.

## 2. Non-goals (v1)

No user accounts, no server-side anything, no full tracker/macro editor, no
cycle-accurate emulation (musical *models* of the chips, not emulators), no
Nintendo/Sega logos, characters, or trade dress anywhere in the UI.

## 3. Core rules that shaped everything

- **All timing is 60 fps frames.** Parameter changes happen only on frame
  boundaries. This quantization is not a limitation to work around; it is part
  of the sound. Never schedule audio events in seconds from the main thread.
- **The compiler is a pure function.** `compile(song, project, profile) →
  FrameScript`. Deterministic, unit-tested, never reads global state.
- **The audio worklet imports nothing from the app** (it is bundled
  separately); its DSP core is a plain class that also runs under Node so the
  test suite can render audio sample-exactly.
- **TypeScript strict, no `any`.** Dependency list is closed — adding one
  requires an explicit decision.

## 4. Chip models

### NES 2A03
Five channels, mono. Pulse ×2 (duty 12.5/25/50/75%, 4-bit volume, 11-bit
timer), triangle (32-step staircase, no volume — the bass channel), noise
(15-bit LFSR with a 93-step metallic short mode). Pitch round-trips through the
real timer math (`1789773 / (16·(t+1))`) so high notes acquire the chip's true
detune; timers below 8 go silent, which is authentic and preserved. Output runs
through the chip's published nonlinear mixer and a three-pole console output
filter (90 Hz + 440 Hz high-pass, 14 kHz low-pass).

### Game Boy DMG
Four channels, stereo with per-channel hard pan (off/L/R/both). Pulse ×2, a
32×4-bit programmable wavetable channel with four shipped presets, and an LFSR
noise channel with the 7-bit "metallic" width mode. Volume changes respect the
hardware's 64 Hz envelope quantization (increases immediate, decreases wait for
the tick). Frequencies: `131072 / (2048 − x)`.

### Super Nintendo SPC700 (style model)
Eight sample-playback voices, stereo, with the console's signature echo bus
(~96 ms delay, 0.4 feedback through a ~5 kHz low-pass, 0.25 wet). The sample
bank is **generated procedurally and deterministically** — strings, e.piano,
brass, flute, harp, bass, choir, and a drum kit — authored at 32000 Hz with
8-bit quantization for BRR-flavored grit and a gaussian-style 3-tap playback
filter. Pitch uses the real 14-bit register (`rate = pitch / 0x1000`, capped at
the hardware's 4× limit, so the melodic ceiling is B5 with octave fold-down).

### Sega Genesis YM2612 (style model)
Five lanes of genuine 4-operator FM synthesis — the chip's 8 algorithm
topologies, operator feedback, per-op multiple/detune/level/ADSR, and an
8-patch bank (e.piano, bass, brass, bell, lead, organ, strings, pluck) — plus a
DAC drum lane playing the shared sample bank at 8 bits with ~11 kHz
sample-and-hold grit. Frequencies use the chip's real fnum/block encoding
(`freq = fnum · 2^(block−1) · 7670453/(144·2^20)`), packed into the same 16-bit
register array every other chip uses.

## 5. Data model (the load-bearing decision)

```
MIDI file ──import──▶ Song (normalized notes/tempo)
Song + Project (user's arrangement) ──compile──▶ FrameScript
FrameScript ──ApuCore──▶ audio samples (realtime worklet OR offline render)
```

`FrameScript` is per-channel parallel typed arrays, one entry per frame:
`period` (timer/fnum/pitch register), `volume` (0–15), `duty` (duty index /
wave preset / FM patch / sample index), `pan`, and `trig` (note-on marker for
FM key-on and sample restart). A three-minute song is ~10,800 frames × a few
channels × five small arrays — tiny, transferable to the worklet in one
message, and identical for playback, WAV export, and video export.

## 6. The compiler

Polyphony is resolved the 8-bit way: **top**/**bottom** note extraction,
**arp** (chord tones cycled at 1–3 frames per step — the signature chiptune
shimmer), and **split** (chord spread across channels). A GM drum map routes
kick/snare/toms/hats/crash onto the noise channel (or sampled kits on 16-bit
chips) with priority resolution. Instruments are FamiTracker-style per-frame
macro tables (volume/arpeggio/pitch/duty) with a small tweak surface (duty,
attack/decay, vibrato) instead of a macro editor. Regions let any bar range
override instrument, channels, or poly mode. Layer modes (double, detune,
echo, octave) fatten a lead across two pulse channels.

## 7. UI

Dense, utilitarian, dark. One screen: header (chip select, BPM, transport,
export), a chip rack of drag-target channel cards, a track list with per-track
piano rolls, a bar ruler with click-seek and drag-loop. A "GB VIEW" toggle
swaps in a DAW-style full-screen visualization. Chord Assist panel detects key
and chords and offers diatonic enrichment and substitute progressions (corpus:
ldrolez/free-midi-chords, MIT). Pixel-art accents in the logo only; body text
is never pixelated.

## 8. Export and share

- **WAV**: offline render through the exact same ApuCore (mono for NES, stereo
  otherwise), optional loop-2×-with-fade; hand-written 40-line PCM encoder.
- **Video**: 9:16 720×1280 MP4 (H.264+AAC via MediaRecorder) of the
  visualization with console art matching the chip — a drawn Game Boy for
  NES/GB, an SNES-style or Genesis-style console (logo-free homage) under a
  chip-tinted playthrough panel for the 16-bit chips, song title on the
  cartridge label.
- **Project files**: zod-validated JSON with the MIDI embedded base64;
  **share links** compress the whole project into the URL fragment with
  lz-string. No server.

## 9. Acceptance criteria (samples from the spec)

- The NES fixture sounds unmistakably like an NES, compared by ear against a
  FamiTracker export of the same pattern; period conversion and LFSR sequences
  are unit-tested.
- Chunked realtime rendering and whole-file offline rendering produce
  sample-exact identical output (proves the player is deterministic).
- Every milestone ends with `npm test` and `npm run build` green.
