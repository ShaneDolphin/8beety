# Chiptune Composer — M5 Implementation Plan (Game Boy profile)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** `gb` chip profile — CH1/CH2 square, CH3 32×4-bit wave with presets, CH4 noise (15/7-bit LFSR), stereo with per-channel hard pan, 64 Hz envelope quantization. Acceptance (§12 M5): switching NES ↔ GB re-arranges slots sensibly (triangle bass → wave bass) and keeps playing.

**Spec:** §4.2, §4.4, §5 (Wave Bass, Organ), §6.3 (pan), §9.1, §12 M5.

## Decisions locked here
- **GB channel ids reuse `p1`/`p2`/`noise` and add `wave`** so chip switching only remaps `tri↔wave`; a pure `remapForChip(tracks, chip)` also swaps instruments via a table (`tri-bass/tri-pluck → wave-bass`; `wave-bass/organ → tri-bass`).
- **Period registers:** FrameScript `period` stores the GB 11-bit register x (pulse f=131072/(2048−x), wave f=65536/(2048−x)). x=0 is unreachable within the midiRanges (pulse [36,119], wave [24,107]) so `period 0 = off` stays unambiguous; render clamps GB periods to ≥1.
- **Wave RAM never travels in FrameScript** (schema §6.3 has no field for it): four preset waves (triangle-ish, saw-ish, organ, buzz) are baked into the worklet as `WAVE_PRESETS`; the wave channel's `duty` array carries the **preset index** (deviation from the spec comment "wave volume code" — the index is strictly more useful and volume stays in `volume`, quantized by the worklet to GB's 100/50/25/off codes at ≥12/≥6/≥1/0).
- **GB noise**: proper GB LFSR taps (bit0 XOR bit1 → bit14, and mirrored into bit6 in 7-bit width mode; seed 0x7FFF), clocked pragmatically at `1789773/period` so the chip-agnostic drum presets work unchanged on both chips (documented approximation; GB divisor table deferred).
- **Envelope quantization (64 Hz)**: `GbVolumeLatch` — volume *increases* apply immediately (register write semantics), *decreases* latch on 64 Hz ticks. Applied to GB pulse and noise.
- **Stereo**: worklet always outputs 2 channels; NES writes the mono mix to both; GB sums per side from each channel's `pan` bits (1=L, 2=R, 3=both), normalized /60 with a 90 Hz one-pole HP per side. `TrackArrangement.pan?: 0|1|2|3` (schema extension, default 3) fills the owned channels' pan arrays; UI shows an L/LR/R select only on the GB chip.
- **Melodic-on-noise** tracks keep the existing (NES pulse timer) behavior on both chips.

## File structure
```
src/engine/pitch.ts          + gbPulsePeriod/gbPulseFreq/gbWavePeriod/gbWaveFreq
src/engine/chip-profiles.ts  + GB_PROFILE, PROFILES map
src/engine/instruments.ts    + wave-bass, organ (kinds ["wave"], duty = wave preset index)
src/engine/arrange-ops.ts    + remapForChip(tracks, chip)
src/engine/compile.ts        chip-aware periodFor/clamp floor, pan fill
src/audio/apu-worklet.ts     + stepGbLfsr, WAVE_PRESETS, GbVolumeLatch, Gb channels, stereo processor
src/audio/player.ts          outputChannelCount [2]
src/store.ts                 setChip; compile against PROFILES[project.chip]
src/components/{Header,ChipRack,TrackList}.tsx  chip select, profile-driven, pan select
tests/pitch-gb.test.ts, tests/dsp-gb.test.ts, tests/remap.test.ts, tests/compile-gb.test.ts
```

## Tasks
- [ ] **1. GB pitch math (TDD).** A4→1750 round-trip (439.8 Hz detune), wave A2→1452, sub-range → null, wave = pulse/2 at equal register distance semantics. Commit.
- [ ] **2. GB DSP (TDD).** `stepGbLfsr` (15-bit period 32767 from 0x7FFF; 7-bit width settles to period 127), `WAVE_PRESETS` (4×32, 0–15, distinct), `GbVolumeLatch` (up = immediate, down = deferred to 64 Hz tick), `GbPulseChannel` duty ratios at GB freq, `GbWaveChannel` emits preset values scaled by volume codes. Stereo processor dispatch (gb reads pan bits; nes duplicates mono). Commit.
- [ ] **3. Profile + instruments + remap + compile (TDD).** GB_PROFILE; wave-bass/organ; `remapForChip` matrix; compile with GB profile emits GB periods (A4→1750 on p1), wave periods on `wave`, pan fill from track.pan. Commit.
- [ ] **4. Store + UI.** `setChip` (remap + recompile + hotSwap keeps playing); Header chip select; ChipRack/TrackList read PROFILES[chip] (WAV chip label); pan select on gb. Test/lint/build. Commit.
- [ ] **5. Verify + deploy.** Browser: load demo on NES, play, switch to GB mid-playback → keeps playing, rack shows Wave card with Wave Bass, stereo output non-identical L/R when a track is hard-panned (offline render check). Switch back to NES → tri restored. Deploy + prod check.

## Verification (acceptance, §12 M5)
1. NES↔GB switch remaps tri→wave with Wave Bass and playback continues uninterrupted (frame counter never stops).
2. Hard-panning a GB track produces measurably different L/R buffers offline.
3. All suites green.
