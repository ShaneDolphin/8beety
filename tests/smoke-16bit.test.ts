import { describe, expect, it } from "vitest";
import { ApuCore } from "../src/audio/apu-worklet";
import { PROFILES, type PlayableChip } from "../src/engine/chip-profiles";
import { compile } from "../src/engine/compile";
import type { Project, TrackArrangement } from "../src/engine/project";
import type { Note, Song, SourceTrack } from "../src/engine/song";

// §9 integration gate: a two-track song (melody + GM drums), compiled and
// rendered end-to-end through ApuCore for every chip profile. This is the
// seam where cross-module drift (duty index vs. patch bank order, drum
// routing) shows up — see Task 6/7's pinned-index tests for the modules to
// check first if a chip fails here.

const SR = 44100;
const PPQ = 96;
const BPM = 120;

// Melody: an 8-quarter-note line over two 4/4 bars (C4-E4-G4-C5 x2).
const MELODY_PITCHES = [60, 64, 67, 72, 60, 64, 67, 72];
const melodyNotes: Note[] = MELODY_PITCHES.map((midi, i) => ({
  tick: i * PPQ,
  durationTicks: PPQ,
  midi,
  velocity: 100,
}));

// GM drums: kick on 1 & 3, snare on 2 & 4, closed hat on every 8th note.
const drumNotes: Note[] = [];
for (let beat = 0; beat < 8; beat++) {
  const tick = beat * PPQ;
  drumNotes.push({ tick, durationTicks: PPQ / 4, midi: beat % 2 === 0 ? 36 : 38, velocity: 100 });
  drumNotes.push({ tick, durationTicks: PPQ / 8, midi: 42, velocity: 90 });
  drumNotes.push({ tick: tick + PPQ / 2, durationTicks: PPQ / 8, midi: 42, velocity: 90 });
}

function melodyTrack(): SourceTrack {
  const pitches = melodyNotes.map((n) => n.midi);
  return {
    index: 0,
    name: "Melody",
    midiChannel: 0,
    isDrums: false,
    notes: melodyNotes,
    maxPolyphony: 1,
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
  };
}

function drumTrack(): SourceTrack {
  const pitches = drumNotes.map((n) => n.midi);
  return {
    index: 1,
    name: "Drums",
    midiChannel: 9,
    isDrums: true,
    notes: drumNotes,
    maxPolyphony: 1,
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
  };
}

function makeSong(): Song {
  return {
    name: "smoke.mid",
    ppq: PPQ,
    originalBpm: BPM,
    tempoMap: [{ tick: 0, bpm: BPM }],
    timeSignature: [4, 4],
    durationTicks: 8 * PPQ, // 2 bars, ~4 s at 120 bpm
    tracks: [melodyTrack(), drumTrack()],
  };
}

function arrangement(overrides: Partial<TrackArrangement>): TrackArrangement {
  return {
    id: overrides.id ?? "t",
    sourceIndex: 0,
    name: "Track",
    slots: [],
    instrumentId: "thin-lead",
    polyMode: "top",
    arpFramesPerStep: 1,
    octaveShift: 0,
    transpose: 0,
    volume: 15,
    mute: false,
    solo: false,
    ...overrides,
  };
}

// Melody slot + instrument, and drum slot, per chip: the seams this test
// exercises (duty/patch wiring, drum routing) differ per chip.
const CHIP_CASES: Record<
  PlayableChip,
  { melodySlot: string; instrumentId: string; drumSlot: string }
> = {
  nes: { melodySlot: "p1", instrumentId: "thin-lead", drumSlot: "noise" },
  gb: { melodySlot: "p1", instrumentId: "thin-lead", drumSlot: "noise" },
  sega: { melodySlot: "fm1", instrumentId: "fm-epiano", drumSlot: "dac" },
  snes: { melodySlot: "v1", instrumentId: "spc-strings", drumSlot: "v2" },
};

describe("16-bit chip render smoke test", () => {
  for (const chip of Object.keys(CHIP_CASES) as PlayableChip[]) {
    it(`${chip}: compiles and renders a non-silent, in-range signal`, () => {
      const { melodySlot, instrumentId, drumSlot } = CHIP_CASES[chip];
      const profile = PROFILES[chip];
      const song = makeSong();
      const project: Project = {
        version: 1,
        chip,
        bpm: BPM,
        tempoMode: "flatten",
        transpose: 0,
        outputFilter: true,
        tracks: [
          arrangement({ id: "melody", sourceIndex: 0, slots: [melodySlot], instrumentId }),
          arrangement({ id: "drums", sourceIndex: 1, slots: [drumSlot], instrumentId: "thin-lead" }),
        ],
      };

      const { script, warnings } = compile(song, project, profile);
      expect(warnings).toEqual([]);
      expect(script.channels.length).toBe(profile.channels.length);

      const core = new ApuCore(SR);
      core.load(script);
      core.play();

      const n = SR * 2; // 2 s
      const out = new Float32Array(n);
      core.render(out, null);

      let rms = 0;
      for (let i = 0; i < n; i++) {
        const s = out[i];
        expect(s).toBeGreaterThanOrEqual(-1);
        expect(s).toBeLessThanOrEqual(1);
        rms += s * s;
      }
      expect(Math.sqrt(rms / n)).toBeGreaterThan(0.003);
    });
  }
});
