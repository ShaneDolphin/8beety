# 16-Bit Chips: SNES (SPC700-style) and Sega Genesis (YM2612-style)

Design spec for adding two 16-bit console sound profiles to Chiptune Composer,
selectable from the existing NES/GB chip dropdown. Extends SPEC.md §4; where
this document and SPEC.md conflict for the new chips, this document wins.

## Goal

Recreate Super Nintendo and Sega Genesis *style* music from modern MIDI using
the exact same pipeline and UI as the 8-bit chips: import MIDI → arrange tracks
onto chip channels → compile to a 60 fps FrameScript → play/render through the
dependency-free ApuCore. Switching between 8-bit and 16-bit is the same one
dropdown it is today.

**Style, not emulation.** Like the existing NES/GB models, these are musical
models of the hardware's character, not register-accurate emulators. The
YM2612 model is real 4-operator FM with the chip's algorithm topologies and
frequency quantization; the SPC700 model is real sample playback with the
chip's pitch register quantization, a BRR-flavored sample character, and the
console's signature echo. Both stay on the 60 fps frame clock (16-bit-era
sound drivers were also frame-driven).

## Non-goals (v1)

- Genesis SN76489 PSG channels (squares + noise). v2; the YM2612 alone reads
  as "Genesis".
- User-editable FM patches or user-imported samples. Preset banks only,
  matching the existing preset-instrument philosophy.
- Fine (7-bit) stereo pan. The existing coarse pan (off/L/R/both) is kept —
  it is authentic for YM2612 per-channel L/R enables and close enough for SPC.
- LFO (YM2612 global LFO, SPC pitch-mod). Vibrato comes from the existing
  pitch macros.

## Chip models

### 4.5 Sega Genesis YM2612 (profile id: `sega`)

Six channels, stereo (per-channel L/R enable, same pan encoding as GB).

| Channel | Kind | Notes |
|---|---|---|
| fm1–fm5 | `fm` | 4-operator FM synthesis, 8 algorithms, preset patch bank |
| dac | `sample` | FM ch6 in DAC mode: 8-bit drum samples, drums only |

- Frequency: fnum/block exactly like the chip. `freq = fnum × 2^(block−1) ×
  7670453 / (144 × 2^20)` (NTSC master clock). The compiler packs
  `(block << 11) | fnum` into the existing 14-bit-friendly `period` array and
  the worklet unpacks it; the fnum quantization is the authentic detune.
- `duty` array carries the FM patch index (same trick as GB wave preset index).
- `volume` (0–15) scales channel output.
- Key-on/off drives the FM envelopes: a new optional `trig` array in
  ChannelFrames marks note-on frames; volume going to 0 is key-off.
- The FM model: 4 sine operators, per-op multiple/detune/total-level and an
  ADSR envelope (attack/decay/sustain-level/release as per-sample rates),
  operator feedback on op 1, the 8 standard YM2612 algorithm topologies.
- DAC drums: the shared drum sample bank played at 8 bits with ~11 kHz
  sample-and-hold for the gritty Genesis percussion character.
- Post: gentle one-pole low-pass around 8 kHz (Genesis output stage grit is
  approximated by the DAC character; keep the post chain minimal).

### 4.6 Super Nintendo SPC700 (profile id: `snes`)

Eight voices, stereo, all sample playback.

| Channel | Kind | Notes |
|---|---|---|
| v1–v8 | `sample` | Preset sample bank; v7/v8 default drum lanes |

- Pitch: the SPC pitch register. `rate = pitch / 0x1000`, samples authored at
  C4 base, `pitch = round(4096 × freq / 261.6256)`, clamped to 14 bits (the
  authentic 4×-up limit). Stored in the existing `period` array.
- `duty` array carries the sample index; `volume` (0–15) is the gain;
  `trig` restarts the sample (one-shots and re-articulated notes).
- Sample character: every sample passes the SNES gaussian-ish 3-tap FIR on
  playback, and the bank is generated with 8-bit quantization for BRR-flavored
  warmth/grit.
- Echo: the console's signature echo on a global bus — ~96 ms delay, ~0.4
  feedback through a one-pole low-pass (~5 kHz), ~0.25 wet mix, stereo.
  Fixed parameters in v1; melodic voices send to it, drum lanes send less.
- All voices accept drums (style choice: SNES kits were samples like anything
  else); GM drums map to the drum samples in the bank.

### Sample bank (shared by `snes` voices and `sega` DAC)

Generated procedurally and deterministically at load — no binary assets, no
new dependencies. Authored internally at 32000 Hz (the SPC's rate) as
Float32Arrays with optional loop points, then pitch-shifted at playback.

Melodic (looped sustain): Strings, E.Piano (FM-generated), Brass, Flute,
Harp (pluck, one-shot), Slap Bass, Choir. Drums (one-shot): Kick, Snare,
Closed Hat, Open Hat, Crash, Tom.

## Data model changes

- `ChannelDef["kind"]` gains `"fm" | "sample"`.
- `ChipProfile["id"]` gains `"sega" | "snes"`; `PROFILES` becomes a record
  over the four playable ids and every `chip === "gb" ? "gb" : "nes"` call
  site is replaced by a `profileFor(chip)` lookup.
- `ChannelFrames` gains optional `trig?: Uint8Array` (1 = note-on this frame).
  The compiler writes it for every chip; only fm/sample consume it.
- `Project.version` stays 1; the zod chip enum widens (old saves still load,
  new saves open in old builds fail zod cleanly — acceptable).

## Instruments

No `Instrument` type change. FM presets are instruments with
`kinds: ["fm"]` whose `duty` macro holds the patch index; sample presets are
`kinds: ["sample"]` whose `duty` macro holds the sample index — exactly the
GB-wave-preset pattern. Volume/arpeggio/pitch/release macros work unchanged.

FM patch bank (8): FM E.Piano, FM Bass, FM Brass, FM Bell, FM Lead,
FM Organ, FM Strings, FM Pluck.

## Compiler

Reused wholesale. Per-chip changes only in pitch conversion (fnum/block pack
for `fm`, SPC pitch for `sample`), `trig` emission on note-on frames, and the
GM drum map routing to sampled kits on `sample` drum lanes for the new chips.
`remapForChip` grows a 4-way slot/instrument mapping table so switching chips
keeps arrangements musically intact.

## UI

- Header dropdown: NES / GB / SNES / SEGA (per-chip accent colors).
- TrackList/ChipRack already render from the profile's channel list.
- Game Boy View + video export: the lane renderer generalizes from 4 lanes to
  `lanes.length` (6 for sega, 8 for snes). Palette stays DMG green in v1.

## Testing

Same doctrine as the 8-bit chips: pure DSP unit tests (fnum round-trip, FM
envelope behavior, algorithm routing, SPC pitch round-trip, echo stability,
sample bank determinism), compile tests for trig/drum routing, and an
end-to-end offline-render smoke test per chip asserting non-silent output.

## Open questions resolved by default (flag to the user)

1. Genesis PSG channels omitted in v1 (6 lanes, not 10).
2. Echo/reverb parameters fixed, not user-tweakable.
3. GB View stays DMG-green for all chips; per-chip palettes later.
4. SNES ships all 8 voices even though busy UIs may prefer 6.
