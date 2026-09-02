```
  ██████    ████████    ██████████  ██████████  ██████████  ██      ██
██      ██  ██      ██  ██          ██              ██      ██      ██
██      ██  ██      ██  ██          ██              ██        ██  ██
  ██████    ████████    ████████    ████████        ██          ██
██      ██  ██      ██  ██          ██              ██          ██
██      ██  ██      ██  ██          ██              ██          ██
  ██████    ████████    ██████████  ██████████      ██          ██
```

# 8BEETY

Turn any MIDI file into music that sounds like it came out of an NES, a Game Boy, a Super
Nintendo, or a Sega Genesis — in your browser, in seconds, with no login and no server.

![8BEETY](docs/img/screenshot.jpg)

Drop in a `.mid`, and the auto-arranger assigns your tracks to real chip channels: melodies to the
pulse channels, bass to the triangle (or the Game Boy's wavetable), drums to the noise LFSR. Chords
become fast arpeggios — the way NES composers actually did it — and everything is compiled to a
frame-by-frame register script played by an authentic sound model in an AudioWorklet.

**Try it:** https://www.8beety.com

## Features

- **Four chips**, switchable mid-playback from one dropdown:
  - **NES 2A03** — nonlinear mixer, console output filter, authentic timer-quantized detune
  - **Game Boy DMG** — four wavetable presets, 64 Hz envelope quantization, true stereo with
    per-channel hard pan
  - **SNES SPC700 style** — eight sample voices from a procedurally generated bank (strings,
    e.piano, brass, choir…) with BRR-flavored grit and the console's signature stereo echo
  - **Sega Genesis YM2612 style** — five lanes of genuine 4-operator FM synthesis (the chip's
    eight algorithms, real fnum/block pitch quantization) plus 8-bit DAC drums
- **Polyphony done the 8-bit way**: top/bottom note extraction, compiler-generated arpeggios with
  chord-tone reduction, split-across-channels mode, and pulse-layer modes (double, detune, echo,
  octave).
- **A real GM drum map**: kick, snare, three tom tiers, hats, crash, ride, metal hit —
  priority-resolved onto the noise channel, or onto sampled kits on the 16-bit chips.
- **FamiTracker-style instruments**: per-frame volume/duty/pitch/arpeggio macros, plus quick
  tweaks (duty, attack/decay, vibrato) without a macro editor. FM patches and sampled instruments
  on the 16-bit chips.
- **Regions**: split a track at any bar and give bars 17–32 a different instrument, channel, or
  poly mode.
- **Chord Assist**: detects your key and chords, enriches triads with diatonic 7ths/9ths/sus, and
  offers substitute progressions from the
  [free-midi-chords](https://github.com/ldrolez/free-midi-chords) corpus, voiced for the chip.
- **Video export**: a 9:16 MP4 ready for TikTok/Shorts — your song scrolling DAW-style across the
  screen of a drawn Game Boy (NES/GB), or above an SNES- or Genesis-style console with the song
  title on the cartridge label (16-bit chips). Survives background tabs, stays QuickTime-safe.
- **Export & share**: 16-bit WAV (44.1/48 kHz, optional loop 2× + fade, sample-identical to
  playback; stereo on stereo chips), self-contained project JSON, arranged MIDI (arps written out
  as fast notes), and share links that pack the whole project into the URL.

## Development

```
npm install
npm run dev        # local dev server
npm test           # vitest (engine, compiler, DSP, theory — ~300 tests)
npm run build      # production build (dist/)
npm run lint
```

Developer-only scripts:

```
node scripts/make-demo-midis.mjs                          # regenerate the demo songs
python3 scripts/build_chord_library.py path/to/free-midi-chords   # rebuild the chord library
```

The spec (`SPEC.md`) is the source of truth for the architecture; `CLAUDE.md` holds the working
conventions; the design docs and implementation plans the app was built from are preserved under
`docs/superpowers/`. The audio engine lives in `src/audio/apu-worklet.ts` (shared by realtime
playback, offline WAV rendering, and the Node test suite), the pure compiler in
`src/engine/compile.ts`.

To enable the "Buy me a coffee" link, set `COFFEE_URL` in `src/config.ts`.

## Learn how this was built

This entire application was built by one person directing an AI coding assistant, spec-first and
milestone by milestone. The [`internet-menace-template/`](internet-menace-template/) folder
packages the project as a beginner-friendly prompt-engineering guide — the design spec, how it
works, how to host it, and the seven lessons behind the method. The guide is also available at
[internetmenace.com](https://internetmenace.com).

## Credits

- Chord progressions derived from [ldrolez/free-midi-chords](https://github.com/ldrolez/free-midi-chords) (MIT)
- NES APU documentation: [NESdev wiki](https://www.nesdev.org/wiki/APU)
- Game Boy audio documentation: [Pan Docs](https://gbdev.io/pandocs/Audio.html)
- SNES and Genesis audio background: [SFC Development Wiki](https://wiki.superfamicom.org/) and
  [Sega Retro](https://segaretro.org/YM2612)

Not affiliated with Nintendo or Sega. No Nintendo or Sega assets are used or imitated.

## License

[MIT](LICENSE) © 2026 Shane Morris
