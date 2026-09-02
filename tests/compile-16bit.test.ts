import { describe, expect, it } from "vitest";
import { compile } from "../src/engine/compile";
import { SEGA_PROFILE, SNES_PROFILE } from "../src/engine/chip-profiles";
import type { ChipProfile } from "../src/engine/chip-profiles";
import { SAMPLED_DRUM_INDEX, sampledDrumFor } from "../src/engine/drums";
import { SAMPLE_INDEX } from "../src/audio/apu-worklet";
import { spcPitch, ymPack } from "../src/engine/pitch";
import type { Project, TrackArrangement } from "../src/engine/project";
import type { Note, Song, SourceTrack } from "../src/engine/song";

const PPQ = 96;

function srcTrack(index: number, notes: Note[], opts?: Partial<SourceTrack>): SourceTrack {
  const pitches = notes.map((n) => n.midi);
  return {
    index,
    name: `Track ${index + 1}`,
    midiChannel: 0,
    isDrums: false,
    notes,
    maxPolyphony: 1,
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
    ...opts,
  };
}

function makeSong(notes: Note[], durationTicks = PPQ * 8): Song {
  return {
    name: "t.mid",
    ppq: PPQ,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks,
    tracks: [srcTrack(0, notes)],
  };
}

function makeArrangement(overrides: Partial<TrackArrangement>): TrackArrangement {
  return {
    id: "t0",
    sourceIndex: 0,
    name: "Track 1",
    slots: ["p1"],
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

function makeProjectShape(
  chip: ChipProfile["id"],
  tracks: TrackArrangement[],
  overrides?: Partial<Project>,
): Project {
  return {
    version: 1,
    chip,
    bpm: 120,
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks,
    ...overrides,
  };
}

// Builds a one-track Song with a C4 quarter note (or two, when opts.twoNotes)
// and a Project with the track assigned to the given slot/instrument.
function makeProject(
  chip: ChipProfile["id"],
  slotId: string,
  instrumentId: string,
  opts?: { twoNotes?: boolean },
): { song: Song; project: Project } {
  const notes: Note[] = opts?.twoNotes
    ? [
        { tick: 0, durationTicks: PPQ, midi: 60, velocity: 100 },
        { tick: PPQ, durationTicks: PPQ, midi: 60, velocity: 100 },
      ]
    : [{ tick: 0, durationTicks: PPQ, midi: 60, velocity: 100 }];
  const song = makeSong(notes);
  const project = makeProjectShape(chip, [
    makeArrangement({ slots: [slotId], instrumentId }),
  ]);
  return { song, project };
}

describe("drum index mirror", () => {
  it("matches the worklet bank order", () => {
    expect(SAMPLED_DRUM_INDEX.kick).toBe(SAMPLE_INDEX.kick);
    expect(SAMPLED_DRUM_INDEX.crash).toBe(SAMPLE_INDEX.crash);
  });
  it("maps GM 36 to kick and GM 46 to open hat", () => {
    expect(sampledDrumFor(36).index).toBe(SAMPLED_DRUM_INDEX.kick);
    expect(sampledDrumFor(46).index).toBe(SAMPLED_DRUM_INDEX.hatOpen);
  });
});

describe("compile for 16-bit chips", () => {
  it("sega: C4 on fm1 writes packed fnum, patch duty, and a trig", () => {
    const { song, project } = makeProject("sega", "fm1", "fm-epiano");
    const { script } = compile(song, project, SEGA_PROFILE);
    const ch = script.channels[0];
    const on = ch.trig ? Array.from(ch.trig).indexOf(1) : -1;
    expect(on).toBeGreaterThanOrEqual(0);
    expect(ch.period[on]).toBe(ymPack(261.6256) /* C4 */);
    expect(ch.volume[on]).toBeGreaterThan(0);
  });
  it("snes: C4 on v1 writes the SPC pitch", () => {
    const { song, project } = makeProject("snes", "v1", "spc-strings");
    const { script } = compile(song, project, SNES_PROFILE);
    const ch = script.channels[0];
    const on = ch.trig ? Array.from(ch.trig).indexOf(1) : -1;
    expect(ch.period[on]).toBe(spcPitch(261.6256));
  });
  it("re-articulated notes each get a trig", () => {
    const { song, project } = makeProject("snes", "v1", "spc-strings", { twoNotes: true });
    const { script } = compile(song, project, SNES_PROFILE);
    const trigs = Array.from(script.channels[0].trig ?? []).filter((x) => x === 1).length;
    expect(trigs).toBe(2);
  });
});
