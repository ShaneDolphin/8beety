# 8BEETY — What It Does

**Live app:** https://www.8beety.com · **Source:** https://github.com/ShaneDolphin/8beety

8BEETY turns any MIDI file into music that sounds like it came out of a game
console from 1985–1994. Everything happens in your browser — the file never
leaves your machine.

## The 60-second tour

1. **Drop in a `.mid` file** (or a saved 8BEETY project). The auto-arranger
   reads your tracks and assigns them to chip channels the way a real chiptune
   composer would: melody to a pulse channel, bass to the triangle or
   wavetable, drums to the noise generator, chords turned into fast arpeggios.
2. **Press play.** You're hearing a faithful sound model of the actual chip —
   not "8-bit style" filters over normal synths.
3. **Pick your console** from one dropdown:
   - **NES** — the classic 2A03: two square waves, triangle bass, noise drums
   - **GB** — Game Boy: squares, a wavetable voice, stereo hard-panning
   - **SNES** — eight sampled voices (strings, e.piano, brass, choir…) with
     the Super Nintendo's signature echo
   - **SEGA** — five channels of gritty Yamaha FM synthesis plus 8-bit DAC
     drums
   Switching remaps your whole arrangement to the new chip's channels and
   instruments — mid-playback, without stopping.
4. **Shape the arrangement.** Drag tracks between channel cards; choose
   instruments (square leads, plucks, FM bells, sampled flutes…); tweak duty,
   attack/decay, and vibrato; set poly modes (highest note, lowest note,
   arpeggio speed, or split-across-channels); split a track into regions so the
   chorus can sound different from the verse; fatten a lead with detune or echo
   layering.
5. **Use Chord Assist.** It detects your key and chord progression, can
   enrich plain triads with diatonic 7ths and 9ths, and suggests substitute
   progressions drawn from a 108-progression corpus.
6. **Export:**
   - **WAV** — studio-clean offline render (with optional loop-2×-and-fade,
     since game music loops)
   - **Video** — a 9:16 MP4 ready for TikTok/Shorts/Reels: your song scrolling
     DAW-style across the screen of a drawn Game Boy (NES/GB songs) or above an
     SNES- or Genesis-style console with your song title on the cartridge label
   - **MIDI** — your arranged version back out as a standard MIDI file
   - **Project JSON** — save and reload your whole arrangement
7. **Share a link.** The entire project — MIDI included — is compressed into
   the URL itself. No account, no upload, no server.

## What makes it sound *right* (not just "retro")

- Pitches go through the real chips' register math, so high notes drift
  slightly out of tune exactly the way the hardware drifts.
- Chords become 20-times-a-second arpeggios — the actual technique NES
  composers used, and the source of the signature chiptune shimmer.
- The NES output passes through the console's real nonlinear mixer and output
  filter; the Game Boy's volume changes snap to its 64 Hz envelope clock; the
  SNES voices get BRR-flavored grit and gaussian warmth; the Genesis FM uses
  the YM2612's genuine operator algorithms.
- Everything is quantized to the 60 fps frame clock those sound drivers
  actually ran on.

## Who it's for

Musicians who want a chiptune cover in minutes, game developers who need
period-correct music, educators demonstrating how console audio worked, and —
via this template — students learning how a specification becomes software.
