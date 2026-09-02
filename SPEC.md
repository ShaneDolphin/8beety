# Chiptune Composer: Build Specification

A browser-based tool that turns any MIDI file into music that sounds like it came out of an NES or a Game Boy. Drop in a MIDI, set a tempo, assign tracks to chip channels, swap instruments, export a WAV. No login, no server, hosted as a static site.

This document is the source of truth for the build. Read it fully before writing code. Each milestone in Section 12 is meant to be one Claude Code session or less.

---

## 1. Goals and non-goals

### Goals

1. Load a Standard MIDI File (type 0 or 1) via drag-and-drop or file picker and hear it as chiptune within seconds.
2. Set a global tempo (BPM) independent of the tempo stored in the MIDI.
3. Assign each MIDI track to a chip channel and pick a synthetic instrument for it. Swap instruments freely. Mute, solo, shift octave, adjust volume.
4. Produce output that is authentically constrained by real hardware (NES 2A03 or Game Boy DMG), because the constraints are what make it sound right.
5. Handle polyphony intelligently. Real chips are monophonic per channel. Chords must be converted into arpeggios or spread across channels, which is what the original composers did.
6. Offer a "Chord Assist" mode that detects the chords in a track and suggests richer voicings and progressions, using the free-midi-chords library as the reference corpus.
7. Export to WAV. Save and load projects as JSON. Share via URL.
8. Run identically as a local dev server and as a static site on Vercel. Zero backend in v1.
9. Include a "Buy me a coffee" link. No accounts, no paywall, no tracking beyond optional privacy-friendly analytics.

### Non-goals (v1)

- Piano-roll note editing. Tracks are visualized but not edited note-by-note.
- Sample import, VST-style plugins, effects racks, automation lanes.
- Multi-user collaboration or persistent user accounts.
- Cycle-accurate hardware emulation. We emulate the *sound model* accurately at the audio sample rate; we do not emulate the CPU.
- Mobile-first design. It must not break on mobile, but the desktop browser is the primary target.

### Guiding principle

This is a very small DAW. Every feature must justify itself by making a MIDI file sound more like a game soundtrack with fewer clicks. When in doubt, leave it out.

---

## 2. Stack decision

**Language: TypeScript, not Python.** The audio engine must run inside the browser for the tool to be "instant," shareable, and hostable on Vercel with no backend. Python in the browser (Pyodide) is too heavy for real-time audio and has no good scheduling story. A Python backend that renders audio server-side would break the "no extra work in a browser" and "no login" goals and would cost money at scale.

Python does have one job in this project: the offline script that converts the free-midi-chords corpus into a JSON chord library at build time (Section 8). That script is run once by the developer, never by users.

| Layer | Choice | Why |
|---|---|---|
| Build tool | Vite | Static output, zero-config Vercel deploy, fast dev server |
| UI | React 18 + TypeScript (strict) | Boring and reliable |
| Styling | Tailwind CSS | Fast to build a dense, utilitarian DAW layout |
| State | Zustand | Small, no boilerplate, easy to serialize the project |
| Audio | Web Audio API with a custom `AudioWorkletProcessor` | Sample-accurate, runs off the main thread, same code path for realtime and offline WAV render |
| MIDI parsing | `@tonejs/midi` (MIT) | Clean JSON output: tracks, notes, tempo map, PPQ |
| Music theory | `tonal` (MIT) | Chord detection, scale/key utilities, Roman numeral conversion |
| Schema validation | `zod` | Validate project JSON on load and on share-link decode |
| URL sharing | `lz-string` | Compress project JSON into the URL fragment |
| Testing | Vitest | Unit tests for the compiler (deterministic) |
| Hosting | Vercel (static) | Push to deploy |
| Optional backend (v2 only) | Supabase (anon key, RLS) | Short share links only. No auth. |

Do not add dependencies beyond this list without a comment in the PR explaining why. In particular, do **not** pull in Tone.js for synthesis. Its oscillators are band-limited and smooth; we want the aliasing, stepped, quantized character of the real chips.

---

## 3. Sound design: why it sounds "rich"

This section is the most important thing to understand before touching the audio engine.

The NES sound chip (2A03) cannot play a chord on a single channel. Each channel produces exactly one pitch at a time. The Game Boy is the same. What the ear hears as "chords" in Mega Man, Castlevania, Tetris, or Pokémon is produced by four techniques, and this app must implement all four:

1. **Arpeggios.** One channel cycles through the notes of a chord very fast (each note held for 1–3 video frames at 60 fps). A C major triad played at one frame per note cycles 20 times per second and reads as a shimmering chord. This is the signature chiptune texture.
2. **Channel layering.** The two pulse channels play different chord tones (or the melody plus a harmony line a third or sixth away), and the triangle holds the root an octave down. Three channels, three notes, one chord.
3. **Detuned doubling and echo.** Pulse 2 plays the same line as Pulse 1, either slightly detuned (chorus) or delayed by a few frames at lower volume (echo). This is why NES leads sound wide even though the output is mono.
4. **Per-frame instrument macros.** Volume, duty cycle, pitch, and arpeggio offsets change every frame according to small tables. A "pluck" is a volume table like `15 12 9 7 5 4 3 2 2 1 1 0`. A "brass" sound is a duty table like `12.5% 12.5% 25% 25% 50% ...`. This is how FamiTracker and LSDj define instruments, and it is the model we use.

The practical consequence: this app is not a synthesizer that receives MIDI notes. It is a **compiler** that takes a MIDI file plus an arrangement and produces a frame-by-frame register script for a chip model, plus a **player** that renders that script. Everything downstream of the compiler is deterministic, which makes WAV export trivial and testing easy.

---

## 4. Chip models

All timing is quantized to a **frame clock of 60 Hz** (NTSC). Parameter changes happen only on frame boundaries. This quantization is not a limitation to work around; it is part of the sound.

### 4.1 NES 2A03 (profile id: `nes`)

Five channels, mono output.

| Channel | Waveform | Volume | Notes |
|---|---|---|---|
| Pulse 1 | Square, duty 12.5% / 25% / 50% / 75% | 4-bit (0–15) | Has pitch sweep. 75% duty sounds identical to 25%. |
| Pulse 2 | Same as Pulse 1 | 4-bit | |
| Triangle | 32-step, 4-bit staircase triangle | **None** (on/off only) | Sounds one octave lower than pulse at the same timer value. This is the bass channel. |
| Noise | 15-bit LFSR | 4-bit | 16 fixed period values. Mode bit selects a 93-step short loop that sounds metallic and pitched. |
| DPCM | 1-bit delta samples | 7-bit output | 16 fixed sample rates. Used for drum samples. **Optional in v1.** |

Pitch: MIDI note → frequency → 11-bit timer value → frequency. Round-trip the timer so that high notes acquire the real chip's slight detuning. Timer values below 8 silence the pulse channels (this is authentic and should be preserved: notes above roughly MIDI 115 on pulse go silent).

- Pulse frequency: `1789773 / (16 * (timer + 1))`
- Triangle frequency: `1789773 / (32 * (timer + 1))`
- Practical pulse range: roughly MIDI 33 (A1, ~55 Hz) to 115. Clamp lower notes up by octaves and flag them in the UI.

Mixer (nonlinear, from the NESdev wiki; verify against nesdev.org before implementing):

```
pulse_out = 95.88 / ((8128 / (pulse1 + pulse2)) + 100)
tnd_out   = 159.79 / ((1 / (triangle / 8227 + noise / 12241 + dmc / 22638)) + 100)
output    = pulse_out + tnd_out
```

Post-filter: the NES output passes through two high-pass stages (about 90 Hz and 440 Hz) and a low-pass around 14 kHz. Implement as simple one-pole filters. Make the post-filter a toggle in Settings ("Console output filter"), default on.

### 4.2 Game Boy DMG (profile id: `gb`)

Four channels, **stereo** output with hard panning per channel (each channel is on, off, or both for the left and right outputs).

| Channel | Waveform | Volume | Notes |
|---|---|---|---|
| CH1 | Square, duty 12.5% / 25% / 50% / 75% | 4-bit + hardware envelope | Has sweep |
| CH2 | Square | 4-bit + envelope | No sweep |
| CH3 | Wave: 32 samples × 4-bit, programmable | 100% / 50% / 25% / off | The Game Boy's "third voice." Ships with wave presets (triangle-ish bass, saw-ish, organ, buzz). |
| CH4 | Noise, LFSR | 4-bit + envelope | 15-bit or 7-bit LFSR width (7-bit is the metallic one) |

- Pulse frequency: `131072 / (2048 - x)` where x is the 11-bit period register
- Wave frequency: `65536 / (2048 - x)`
- Hardware envelope: 4-bit start volume, direction up/down, step every N/64 s. We drive volume from instrument macros instead, but the envelope step quantization (64 Hz) should be respected for authenticity.

### 4.3 NES + VRC6 expansion (profile id: `nes-vrc6`), v2

The Konami VRC6 mapper (Castlevania III, Japanese release) added two more pulse channels with 8 duty settings (1/16 through 8/16) plus a 6-bit sawtooth channel. This profile exists for users who want denser arrangements while staying period-correct. Ship it after `nes` and `gb` are solid.

### 4.4 Profile definition

```ts
type ChipProfile = {
  id: "nes" | "gb" | "nes-vrc6" | "sega" | "snes";
  name: string;
  stereo: boolean;
  channels: ChannelDef[];
};

type ChannelDef = {
  id: string;                 // "p1", "p2", "tri", "noise", "dmc", "wave", "saw", "fm1"..."fm5", "dac", "v1"..."v8"
  label: string;              // "Pulse 1"
  kind: "pulse" | "triangle" | "noise" | "dpcm" | "wave" | "saw" | "fm" | "sample";
  hasVolume: boolean;
  duties?: number[];          // fraction of period, e.g. [0.125, 0.25, 0.5, 0.75]
  midiRange: [number, number];
  acceptsDrums: boolean;      // noise, dpcm, and triangle (for kick) are true; also fm/sample drum lanes
};
```

### 4.5 Sega Genesis YM2612 (profile id: `sega`)

Six channels, stereo output (per-channel L/R enable, same pan encoding as Game Boy).

| Channel | Kind | Volume | Notes |
|---|---|---|---|
| FM 1–5 | 4-operator FM synthesis, 8 algorithms | 4-bit (0–15), scales channel output | Preset patch bank selected via the `duty` array (same trick as GB wave presets); a `trig` array marks note-on frames to key the FM envelopes. |
| DAC | Sample (FM ch6 in DAC mode) | 4-bit | 8-bit drum samples, ~11 kHz sample-and-hold, for Genesis-style percussion grit. Drums only. |

Pitch: fnum/block, exactly like the chip. `freq = fnum × 2^(block−1) × 7670453 / (144 × 2^20)` (NTSC master clock); the compiler packs `(block << 11) | fnum` into the `period` array, so the fnum quantization is the chip's authentic detune.

Post-filter: a gentle one-pole low-pass around 8 kHz.

Style model; see docs/superpowers/specs/2026-09-01-16bit-chips-design.md for rationale (simplified linear operator order, linear-segment envelopes rather than rate-scaled dB).

### 4.6 Super Nintendo SPC700 (profile id: `snes`)

Eight voices, stereo, all sample playback.

| Channel | Kind | Volume | Notes |
|---|---|---|---|
| V1–8 | Sample playback, preset bank | 4-bit (0–15), scales channel output | Sample selected via the `duty` array; a `trig` array restarts the sample. Every voice accepts drums (style choice: SNES kits were samples like anything else). |

Pitch: the SPC pitch register. `pitch = round(4096 × freq / 261.6256)` (samples authored at C4), clamped to 14 bits — the authentic 4×-up limit — stored in the `period` array.

Every sample passes a gaussian-ish 3-tap FIR on playback. The sample bank (shared with the `sega` DAC lane) is generated procedurally and deterministically at load, 8-bit quantized for BRR-flavored warmth.

Echo: a global bus, fixed in v1 — ~96 ms delay, ~0.4 feedback through a one-pole low-pass around 5 kHz, ~0.25 wet mix, stereo.

Style model; see docs/superpowers/specs/2026-09-01-16bit-chips-design.md for rationale (echo and envelope behavior approximated, not a BRR/DSP-accurate emulation).

---

## 5. Instruments

An instrument is a set of per-frame macro tables, FamiTracker-style. Tables can loop from a given index or hold their last value.

```ts
type Macro = { values: number[]; loop?: number };   // loop = index to jump back to; undefined = hold last

type Instrument = {
  id: string;
  name: string;
  kinds: ChannelDef["kind"][];   // which channel kinds this instrument is valid on
  volume: Macro;                 // 0–15, applied per frame from note-on
  arpeggio?: Macro;              // semitone offsets relative to the note, e.g. [0, 4, 7] for a major triad
  pitch?: Macro;                 // fine pitch offsets in timer units (vibrato, drum pitch drops)
  duty?: Macro;                  // index into the channel's duties array
  wave?: number[];               // 32 × 4-bit, Game Boy CH3 only
  noiseMode?: "long" | "short";
  release?: Macro;               // volume table played on note-off; if absent, cut immediately
};
```

### Built-in presets (v1)

Leads (pulse):
- **Square Lead** (50% duty, sustained, slight vibrato after 20 frames)
- **Thin Lead** (25% duty, sustained)
- **Nasal Lead** (12.5% duty, sustained)
- **Pluck** (25% duty, fast decay `15 11 8 6 4 3 2 1 0`)
- **Brass** (duty macro `0 0 1 1 2 2 2 ...`, volume swell)
- **Echo Lead** (same as Square Lead but intended for the Pulse 2 "echo" role; the compiler applies delay + volume reduction)

Bass:
- **Tri Bass** (triangle, sustained)
- **Tri Pluck** (triangle, cut after 8 frames; the triangle has no volume so "pluck" means short gate)
- **Pulse Bass** (12.5% duty, one octave down, short decay)
- **Wave Bass** (Game Boy CH3, triangle-ish wave)

Chords:
- **Arp Chord** (pulse, arpeggio driven by the compiler from the actual chord tones, 1 frame per step)
- **Arp Chord Slow** (2 frames per step)
- **Organ** (Game Boy CH3 organ wave, sustained)

Drums (noise, optionally triangle/DPCM):
- **Kick** (noise: short low burst `15 10 4 0`; plus triangle pitch drop over 3 frames if triangle is free and "Tri Kick" is enabled)
- **Snare** (noise mid period, `15 13 10 7 5 3 2 1 0`)
- **Closed Hat** (noise high period, `8 4 1 0`)
- **Open Hat** (noise high period, `10 8 7 6 5 4 3 2 1 0`)
- **Crash** (noise, long decay ~30 frames)
- **Metal Hit** (noise short-loop mode, pitched)

Each preset has a one-click **audition** button that plays a C4 (or a hit, for drums) through the current chip.

### Minimal instrument tweaks (v1)

Per track, expose exactly these controls on top of the preset: duty (where applicable), attack/decay (which rewrites the volume macro from two numbers), vibrato depth, vibrato delay. No full macro editor in v1. If people want to hand-edit macros, they can edit the project JSON; document the format.

---

## 6. Data model

### 6.1 Normalized song (output of MIDI import)

```ts
type Song = {
  name: string;
  ppq: number;
  originalBpm: number;            // first tempo event, or 120
  tempoMap: { tick: number; bpm: number }[];
  timeSignature: [number, number];
  durationTicks: number;
  tracks: SourceTrack[];
};

type SourceTrack = {
  index: number;
  name: string;                   // from track name meta, else "Track N"
  midiChannel: number;            // 0–15; channel 9 is drums under GM
  program?: number;               // GM program number if present
  isDrums: boolean;               // midiChannel === 9 or name matches /drum|perc/i
  notes: Note[];                  // sorted by tick
  maxPolyphony: number;           // computed; used to suggest a polyMode
  pitchRange: [number, number];
};

type Note = { tick: number; durationTicks: number; midi: number; velocity: number };
```

### 6.2 Project (what the user edits, saves, and shares)

```ts
type Project = {
  version: 1;
  chip: ChipProfile["id"];
  bpm: number;                    // global override; the tempo map is flattened to this
  tempoMode: "flatten" | "scale"; // flatten = constant bpm; scale = keep tempo changes, scale by bpm/originalBpm
  transpose: number;              // global semitones
  outputFilter: boolean;
  tracks: TrackArrangement[];
  chordAssist?: ChordAssistState;
};

type TrackArrangement = {
  id: string;
  sourceIndex: number;            // -> Song.tracks[sourceIndex]
  name: string;
  slots: string[];                // channel ids this track is assigned to; [] = unassigned (silent)
  instrumentId: string;
  polyMode: "top" | "bottom" | "arp" | "split";
  arpFramesPerStep: 1 | 2 | 3;
  octaveShift: number;            // -3..+3
  transpose: number;              // semitones
  volume: number;                 // 0–15 scale factor applied to the macro
  mute: boolean;
  solo: boolean;
  regions?: Region[];             // optional per-section overrides
};

type Region = {
  startBar: number;
  endBar: number;                 // exclusive
  instrumentId?: string;
  slots?: string[];
  polyMode?: TrackArrangement["polyMode"];
};
```

Regions are how a user says "for bars 17–32, play this track as a Pluck on Pulse 2 instead." Implement region splitting as a simple "split at bar" action on the track card; each region gets its own compact instrument/slot picker. Keep it modest.

### 6.3 FrameScript (output of the compiler)

```ts
type FrameScript = {
  chip: ChipProfile["id"];
  fps: 60;
  frameCount: number;
  channels: ChannelFrames[];      // one per channel in the chip profile, in order
  barStarts: number[];            // frame index of each bar, for the playhead and loop UI
};

type ChannelFrames = {
  id: string;
  // Parallel typed arrays, one entry per frame. Use typed arrays so the whole script
  // can be transferred to the worklet in one postMessage.
  period: Uint16Array;            // timer/period register value; 0 = off
  volume: Uint8Array;             // 0–15
  duty: Uint8Array;               // duty index (pulse) / wave volume code (gb wave) / mode bit (noise)
  pan: Uint8Array;                // 0 = off, 1 = L, 2 = R, 3 = both (gb only; nes always 3)
};
```

A three-minute song is 10,800 frames × 5 channels × 4 arrays. Tiny.

---

## 7. The compiler

`compile(song, project, profile): FrameScript`. Pure function. Deterministic. Unit-tested.

### 7.1 Timing

1. Build the tempo function. In `flatten` mode, BPM is constant. In `scale` mode, each tempo-map segment is scaled by `project.bpm / song.originalBpm`.
2. Convert every note's tick to an absolute time in seconds, then to a frame index by accumulating fractional frames and rounding at each event (Bresenham-style). Never accumulate rounding error across the song: compute each note's frame as `round(seconds * 60)` from absolute time.
3. Note-off frame = max(note-on frame + 1, round(end seconds * 60)). Every note gets at least one frame.

### 7.2 Track processing order

1. Drop muted tracks. If any track is soloed, drop all non-soloed tracks.
2. For each remaining track, split notes into regions (default: one region spanning the song).
3. For each region, resolve effective instrument, slots, and polyMode (region override → track value).
4. Apply transposition and octave shift, then clamp pitches into the channel's `midiRange` by shifting octaves and record a warning per track (`"12 notes shifted up an octave to fit Pulse range"`).

### 7.3 Polyphony resolution

At each frame, a track may have several notes sounding. Resolve per polyMode:

- **top**: highest sounding note. Good for melodies with occasional double-stops.
- **bottom**: lowest sounding note. Good for bass tracks extracted from piano parts.
- **arp**: gather all sounding notes (cap at 4; when reducing, drop the 5th first, then doubled octaves, keeping root, 3rd, 7th, extensions). Cycle through them, ascending, holding each for `arpFramesPerStep` frames. Restart the cycle on any chord change.
- **split**: the track is assigned to N slots. Sort sounding notes ascending, assign note i to slot i. If there are more notes than slots, the overflow notes arp on the last slot. If fewer, the unused slots are silent for that frame. This is the "spread the chord across the chip" mode.

Drum tracks ignore polyMode. Each hit is mapped by GM note number to a drum preset (Section 7.5) and rendered on the noise channel; simultaneous hits are prioritized kick > snare > crash > open hat > closed hat (louder and rarer wins).

### 7.4 Slot conflicts

One track per slot in v1. The UI prevents assigning two tracks to the same slot (dragging a track onto an occupied slot swaps them). v2 may add a "backup" track per slot that plays only when the primary is silent, which is how NES games interleaved fills.

### 7.5 GM drum map

| GM note | Name | Preset |
|---|---|---|
| 35, 36 | Kick | Kick |
| 37 | Side stick | Metal Hit |
| 38, 40 | Snare | Snare |
| 41, 43, 45, 47, 48, 50 | Toms | Kick at higher noise periods (three pitch tiers) |
| 42, 44 | Closed / pedal hat | Closed Hat |
| 46 | Open hat | Open Hat |
| 49, 52, 55, 57 | Crash / china / splash | Crash |
| 51, 53, 59 | Ride | Closed Hat (longer decay) |
| everything else | | Closed Hat |

### 7.6 Echo and detune helpers

If a track is assigned to two pulse slots with polyMode `top` or `bottom`, offer a "Layer mode" dropdown on the track: **Double** (identical), **Detune** (second pulse +4 timer units, or a fixed cents offset), **Echo** (second pulse delayed by 3, 6, or 9 frames at volume × 0.5), **Octave** (second pulse one octave up or down). This is a compiler feature, not an instrument feature.

### 7.7 Rendering instrument macros

For every note event on a channel, the compiler walks the instrument's macros frame by frame from note-on until note-off (then the release macro, if any), writing `period`, `volume`, and `duty` for that frame. Arpeggio macros add semitone offsets on top of the resolved note. For `arp` polyMode the compiler generates the arpeggio from the chord tones rather than from the instrument's macro; the two are mutually exclusive.

---

## 8. Chord Assist and the chord library

### 8.1 Corpus

Source: https://github.com/ldrolez/free-midi-chords (MIT licensed). As of its Spring 2026 release it contains 13,000+ MIDI files: every common chord in all 12 major and minor keys, plus roughly 190 chord progressions per key organized as Major, Minor, and Modal, each tagged with moods (for example "nostalgic," "hopeful," "dark"). The repo also contains the Python generator (`chords.py`, `gen.py`) built on chords2midi and Mingus.

### 8.2 Build script: `scripts/build_chord_library.py`

Python, run by the developer, not at runtime. Output: `src/theory/chord-library.json`, committed to the repo with attribution in `README.md` and in the app's About panel.

Two extraction strategies; inspect the repo and choose the one that yields clean, key-independent data:

1. **Preferred:** parse the progression definitions from the generator source (`chords.py` or wherever progressions are declared as Roman numeral strings with tags). Roman numerals are key-independent, which is exactly what we want.
2. **Fallback:** walk the release ZIP, parse each progression MIDI with `mido`, reduce each bar to a pitch-class set, detect the chord with a small lookup, and convert to Roman numerals relative to the key encoded in the folder name.

Target schema:

```json
{
  "source": "ldrolez/free-midi-chords v0.20260314, MIT",
  "progressions": [
    {
      "id": "maj-0042",
      "mode": "major",
      "numerals": ["I", "V", "vi", "IV"],
      "qualities": ["maj", "maj", "min", "maj"],
      "tags": ["hopeful", "pop"],
      "bars": 4
    }
  ],
  "voicings": {
    "maj": [0, 4, 7], "min": [0, 3, 7], "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10],
    "dom7": [0, 4, 7, 10], "sus2": [0, 2, 7], "sus4": [0, 5, 7], "add9": [0, 4, 7, 14],
    "min9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14]
  }
}
```

Keep the JSON under ~300 KB. Dedupe progressions that differ only by rhythmic variation (the repo's pop / pop2 / soul / hiphop2 folders contain the same chords with different timing; we only need the chords).

### 8.3 Chord Assist features (v1)

Chord Assist is a side panel, opened from any polyphonic track.

1. **Detect.** Segment the track by bar (or half-bar if the chord changes mid-bar). For each segment, collect pitch classes of sounding notes and identify the chord with `tonal`'s `Chord.detect`, preferring the interpretation whose root matches the lowest note. Detect the song key with `tonal`'s key utilities over the whole track. Display the result as a simple chord strip above the track: `Am  F  C  G`.
2. **Enrich.** A density control with four levels:
   - **0 As written**
   - **1 Sevenths**: add the diatonic 7th to each triad (Am → Am7, C → Cmaj7, G → G7).
   - **2 Colors**: add 9ths where they are diatonic, use sus2/sus4 where the melody note is a 2nd or 4th over the chord.
   - **3 Substitute**: find library progressions in the same mode with the same length whose first and last chords match the detected progression, ranked by tag overlap with a user-chosen mood chip (hopeful, dark, nostalgic, heroic, tense, playful). Offer the top three as one-click swaps.
   Enrichment never edits the source MIDI. It generates a new derived track ("Am7 chords") that the user assigns to slots like any other track, defaulting to polyMode `arp`.
3. **Voice for the chip.** After enrichment, voicings are reduced to at most 4 tones for arp mode, using the same drop rules as Section 7.3, and optionally inverted so the top note stays below the melody track's lowest note in that bar (avoid masking the lead).
4. **Generate (v2).** Pick key, mood, and bar count; produce a chord track from the library with no source MIDI at all. This is the "blank canvas" mode and is explicitly out of scope for v1.

---

## 9. Audio engine and player

### 9.1 Worklet

`src/audio/apu-worklet.ts` is an `AudioWorkletProcessor`. It owns:

- The active chip profile.
- The current `FrameScript` (received via `port.postMessage` as transferable typed arrays).
- The frame clock: every `sampleRate / 60` samples it advances to the next frame and latches that frame's register values for every channel.
- Per-channel oscillators implemented as phase accumulators at the audio sample rate (pulse with duty compare, 32-step triangle lookup, LFSR noise clocked at the period rate, 32-sample wave RAM).
- The chip's nonlinear mixer and post-filter.
- A playhead report: posts `{ frame }` back to the main thread every 4 frames.

It does not schedule anything from the main thread. Transport commands are messages: `load(script)`, `play(fromFrame)`, `pause()`, `seek(frame)`, `setLoop(startFrame, endFrame | null)`, `hotSwap(script)` (replace the script but keep the current frame index; used when the user tweaks a setting during playback).

Do not hardcode 44100 or 48000. Read `sampleRate` from the worklet global scope. Safari on iOS may hand you 44.1 kHz and requires `AudioContext.resume()` inside a user gesture; the Play button must handle this.

### 9.2 Realtime playback

`src/audio/player.ts` creates the `AudioContext` lazily on first Play, registers the worklet module, creates the node, and forwards transport actions from the Zustand store. When any project field that affects the compile changes, recompile (debounced ~50 ms) and `hotSwap`. Compile time for a typical song should be under 20 ms; measure it and log it in dev.

### 9.3 Offline render

`src/audio/render.ts` creates an `OfflineAudioContext` at 44100 Hz (or 48000; expose in the export dialog), registers the same worklet module, loads the script, renders, and encodes 16-bit PCM WAV with a hand-written encoder (about 40 lines; no dependency). Export is mono for `nes` and stereo for `gb`. Also offer "loop 2x + fade" as an export option since game music loops.

### 9.4 Latency and glitches

Use the default latency hint. If the page is backgrounded, keep playing (users tab away while listening). If the worklet reports underruns in dev, log them; do not add buffering layers in the main thread.

---

## 10. UI specification

Layout: a single page, three horizontal bands.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: logo, project name (editable), Chip [NES ▾], BPM [ 140 ],    │
│ Transport ⏮ ▶ ⏸ ■ loop, Export ▾, Share, ☕ Buy me a coffee, About  │
├──────────────────────────────────────────────────────────────────────┤
│ Chip Rack: one card per channel of the selected chip                 │
│ [Pulse 1: "Lead" · Square Lead] [Pulse 2: (empty)] [Triangle: "Bass" │
│  · Tri Bass] [Noise: "Drums" · NES Kit]                              │
├──────────────────────────────────────────────────────────────────────┤
│ Track List: one row per source track (drag handle, name, mini piano  │
│ roll, polyphony badge, slot chips, instrument picker, poly mode,     │
│ octave ±, volume, M, S, "Chord Assist" button)                       │
│                                                                      │
│ Drop zone (whole page): "Drop a .mid file anywhere"                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.1 Interactions

- **Drop a MIDI anywhere** on the page, or click the drop zone. Also load from `public/demo-midis/` via a "Try a demo" menu (ship 3–4 public domain or self-composed demo files; do not ship copyrighted game music).
- **Auto-arrange on import.** Assign tracks to slots with a heuristic so the song plays immediately: the track with the highest mean pitch and low polyphony → Pulse 1 with Square Lead; the next melodic track → Pulse 2 with Thin Lead; the lowest-pitched non-drum track → Triangle with Tri Bass (polyMode bottom); a drum track → Noise; the most polyphonic remaining track → Pulse 2 with Arp Chord if Pulse 2 is still free. Everything else unassigned. Show a toast: "Auto-arranged 4 of 7 tracks. Drag tracks onto the rack to change."
- **Drag a track row onto a rack card** to assign it. Drag onto an occupied card to swap. Drag a slot chip off a track to unassign. Also a dropdown on the track for non-drag users.
- **Instrument picker**: dropdown filtered by the channel kind of the track's first slot. Hover or focus a preset to audition it. Selecting applies immediately (hot-swap while playing).
- **BPM field**: shows the MIDI's original tempo as a placeholder and a "reset" icon. Arrow keys nudge by 1; shift-arrow by 10. Range 40–300.
- **Mini piano roll**: read-only canvas thumbnail per track, 240×40 px, playhead line synced to the worklet's frame report. Click to seek.
- **Loop**: click-drag on the bar ruler above the track list to set a loop range. Bars come from `FrameScript.barStarts`.
- **Split region**: right-click (or a "…" menu) on a track row → "Split at bar N" (N defaults to the playhead's bar). Regions render as segments on the row with their own tiny instrument/slot controls.
- **Keyboard**: Space play/pause, Home to start, L toggle loop, M/S mute/solo on the focused track, 1–9 to focus track N.
- **Warnings**: an unobtrusive icon on a track when notes were clamped, when a polyphonic track is in `top` mode (suggest arp), or when a track is unassigned.

### 10.2 Export menu

- Download WAV (options: 44.1/48 kHz, loop 2x + fade)
- Download project JSON
- Download arranged MIDI (the compiled output rendered back to MIDI, one track per channel, arpeggios written out as fast notes; useful for people who want to take it into a real DAW)
- Copy share link (project JSON compressed with `lz-string` into the URL fragment; the MIDI itself is embedded as base64 inside the project JSON when under 100 KB, else the share link warns that the recipient must supply the MIDI)

### 10.3 Visual style

Dense, utilitarian, dark by default. Monospace numerals for BPM and bars. Pixel-art accents are fine in the logo and rack cards; do not pixelate body text. Do not use or draw any Nintendo, Sega, Game Boy, NES, SNES, or Genesis logos, characters, or trade dress. The Game Boy profile can be tinted olive-green, the NES profile gray-and-red, the Sega Genesis profile blue, and the SNES profile purple as a nod without copying any hardware design.

---

## 11. Hosting, sharing, and support

### 11.1 Vercel

- `npm run build` outputs `dist/`. Vercel detects Vite automatically; no `vercel.json` needed.
- The worklet module must be served as a separate JS file. In Vite, load it with `new URL("./apu-worklet.ts", import.meta.url)` and ensure it is not inlined. Verify the built worklet works in the Vercel preview before merging anything to `main`.
- AudioWorklet requires a secure context. Vercel is HTTPS; `localhost` counts as secure in dev.
- Optional: Vercel Analytics (cookie-free). Nothing else.

### 11.2 Local

`npm install && npm run dev`. The same code runs in the browser locally and in production. No environment variables in v1.

### 11.3 Buy me a coffee

A plain link in the header to a Buy Me a Coffee or Ko-fi page. Do not embed their widget script. Show the link again, softly, on the WAV export success toast ("Enjoying this? Buy me a coffee ☕").

### 11.4 Supabase share links (v2, optional)

Only if URL sharing proves too long for social media. Design:

- Table `shares(id text primary key, project jsonb, created_at timestamptz default now())`
- `check (pg_column_size(project) < 262144)` to cap payload size
- RLS: anon can `insert`; anon can `select` where `id = current_setting('request.jwt.claims')::json->>...` is *not* needed; simply allow `select` by primary key and deny `update`/`delete` to anon entirely
- IDs generated client-side with `nanoid(10)`
- A `pg_cron` job deletes rows older than 90 days
- Still no auth, still no user table

Add rate limiting (Supabase edge function or Vercel middleware) before announcing the feature publicly.

---

## 12. Milestones

Each milestone should end with a working, deployable `main`. Do not start the next milestone until the acceptance checks pass.

### M0: Scaffold and pipeline
- Vite + React + TS strict + Tailwind + Vitest + ESLint.
- `CLAUDE.md` with conventions (Section 14).
- Deploy an empty page to Vercel with a Play button that plays a 440 Hz test tone through a trivial worklet.
- **Accept:** test tone plays on Chrome, Firefox, and Safari (desktop) from the Vercel URL.

### M1: Chip engine
- Implement `ChipProfile` for `nes`; worklet with pulse, triangle, noise; mixer; post-filter.
- Hardcode a `FrameScript` fixture (a C major arpeggio on Pulse 1 at 1 frame/step, root on triangle, closed hat on noise, 4 bars).
- **Accept:** the fixture sounds unmistakably like an NES. Compare by ear against a FamiTracker export of the same pattern. Unit tests for period conversion (MIDI note → timer → Hz) and LFSR sequence.

### M2: MIDI in, sound out
- `@tonejs/midi` import → `Song`. Tempo flatten. Compiler with `top` and `bottom` polyModes, one track per slot, instrument macros.
- Drop zone, BPM field, transport, auto-arrange heuristic, minimal track list (name, slot dropdown, instrument dropdown, M/S).
- **Accept:** a multi-track GM MIDI file plays through the NES profile in under 2 seconds from drop, BPM changes take effect within 100 ms while playing, `compile()` is covered by snapshot tests on 3 fixture MIDIs.

### M3: Polyphony and drums
- `arp` and `split` polyModes, chord-tone reduction rules, GM drum map, drum presets, layer modes (double/detune/echo/octave).
- **Accept:** a piano-only MIDI with block chords sounds like a chiptune arrangement (arp chords + triangle bass + no clipping); a GM drum track produces distinguishable kick/snare/hat.

### M4: Rack UI and drag-and-drop
- Chip Rack cards, drag track → slot, swap on occupied, mini piano rolls with playhead, loop range on the bar ruler, keyboard shortcuts, warnings.
- **Accept:** a first-time user can re-arrange a song with the mouse only, without reading instructions.

### M5: Game Boy profile
- `gb` profile: CH1/CH2 pulse, CH3 wave with presets, CH4 noise, stereo hard pan per channel, envelope quantization.
- **Accept:** switching NES ↔ GB re-arranges slots sensibly (triangle bass → wave bass) and keeps playing.

### M6: Export and share
- WAV offline render (mono/stereo by profile, loop 2x + fade), project JSON save/load with `zod` validation, arranged-MIDI export, URL share link with `lz-string`.
- **Accept:** the WAV is sample-identical to realtime output for the same script at the same sample rate (verify with a test that renders both paths offline). Share link round-trips a project exactly.

### M7: Regions and instrument tweaks
- Split-at-bar regions with per-region instrument/slot/polyMode. Per-track duty, attack/decay, vibrato controls.
- **Accept:** a user can make bars 1–16 a Square Lead and bars 17–32 a Pluck on the same track.

### M8: Chord Assist
- `scripts/build_chord_library.py` and the committed JSON. Detect, Enrich levels 1–3, chip voicing, derived chord tracks.
- **Accept:** on a pop-style MIDI, Detect shows a plausible chord strip; Enrich level 1 audibly thickens the arrangement; level 3 offers three substitutions that are in key and the same length.

### M9: Polish and launch
- Demo MIDIs, About panel with attributions (free-midi-chords, NESdev wiki, Pan Docs), Buy me a coffee link, mobile layout that at least plays and lets you change instruments, README with screenshots, MIT license on the code.
- **Accept:** Lighthouse performance > 90, no console errors, works on iOS Safari for playback.

### v2 backlog
- VRC6 profile, backup tracks per slot, Chord Assist Generate mode, DPCM drum samples, Supabase short links, a real macro editor, PAL 50 Hz mode.

---

## 13. Testing strategy

- **Compiler**: pure function, snapshot tests against fixture MIDIs in `tests/fixtures/`. Any change to the snapshot must be intentional and explained in the commit.
- **Pitch math**: table-driven tests for MIDI → timer → Hz for both chips, including the pulse silence threshold and triangle octave offset.
- **Noise LFSR**: test the first 64 outputs of both modes against known-good sequences.
- **Polyphony resolution**: unit tests for each polyMode with hand-written note sets, including the >4-note reduction rules.
- **Render parity**: offline render of the M1 fixture must match a stored golden WAV within a tolerance (float compare after decoding), so that mixer or filter changes are caught.
- **Chord Assist**: tests for detection on known chord sets and for enrichment producing diatonic results in several keys.
- **Manual**: a `docs/LISTENING-TESTS.md` checklist with 5 reference MIDIs and what "correct" should sound like for each.

---

## 14. Suggested `CLAUDE.md`

```markdown
# Chiptune Composer

Read SPEC.md before doing anything. It is the source of truth.

## Conventions
- TypeScript strict. No `any`. No default exports except React components.
- The compiler (`src/engine/compile.ts`) is a pure function. Never read global state inside it.
- The worklet (`src/audio/apu-worklet.ts`) must not import from the rest of the app; it is bundled separately.
- Do not add dependencies beyond SPEC.md Section 2 without asking.
- All timing is 60 fps frames. Never schedule audio events in seconds from the main thread.
- Run `npm test` and `npm run build` before declaring a milestone done.
- Work one milestone at a time. Do not add features from later milestones early.

## Commands
- `npm run dev`, `npm run build`, `npm run preview`, `npm test`, `npm run lint`
- `python scripts/build_chord_library.py path/to/free-midi-chords` (developer only)

## References
- NES APU: https://www.nesdev.org/wiki/APU
- Game Boy APU: https://gbdev.io/pandocs/Audio.html
- Chord corpus: https://github.com/ldrolez/free-midi-chords (MIT)
```

---

## 15. Suggested first prompt for the Claude Code session

> Read SPEC.md and CLAUDE.md. Execute milestone M0 and then M1 exactly as specified. For M1, build the FrameScript fixture described in Section 12 and make it play through the NES profile. Stop after M1 and give me the Vercel preview URL and a summary of what you verified by ear and by test. Do not start M2.

---

## 16. Open decisions (answer before M2)

1. Project name and domain.
2. Buy Me a Coffee vs Ko-fi link.
3. Whether the arranged-MIDI export (Section 10.2) is worth doing in M6 or should slip to v2.
4. Whether to ship the VRC6 profile in v1 if M5 finishes early.