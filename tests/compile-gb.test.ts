import { describe, expect, it } from "vitest";
import { remapForChip } from "../src/engine/arrange-ops";
import { GB_PROFILE, PROFILES } from "../src/engine/chip-profiles";
import { compile } from "../src/engine/compile";
import type { FrameScript } from "../src/engine/frame-script";
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

function song(tracks: SourceTrack[]): Song {
  return {
    name: "t.mid",
    ppq: PPQ,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks: PPQ * 8,
    tracks,
  };
}

function arrangement(overrides: Partial<TrackArrangement>): TrackArrangement {
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

function project(tracks: TrackArrangement[], overrides?: Partial<Project>): Project {
  return {
    version: 1,
    chip: "gb",
    bpm: 120,
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks,
    ...overrides,
  };
}

function channel(script: FrameScript, id: string) {
  const ch = script.channels.find((c) => c.id === id);
  if (!ch) throw new Error(`no channel ${id}`);
  return ch;
}

const note = (midi: number): Note[] => [{ tick: 0, durationTicks: PPQ * 2, midi, velocity: 100 }];

describe("GB profile", () => {
  it("has p1/p2/wave/noise, stereo", () => {
    expect(GB_PROFILE.stereo).toBe(true);
    expect(GB_PROFILE.channels.map((c) => c.id)).toEqual(["p1", "p2", "wave", "noise"]);
    expect(GB_PROFILE.channels[2].kind).toBe("wave");
    expect(PROFILES.gb).toBe(GB_PROFILE);
  });
});

describe("compile against the GB profile", () => {
  it("uses GB pulse periods (A4 → register 1750)", () => {
    const s = song([srcTrack(0, note(69))]);
    const { script } = compile(s, project([arrangement({})]), GB_PROFILE);
    expect(channel(script, "p1").period[0]).toBe(1750);
  });

  it("renders wave-bass on the wave channel with GB wave periods", () => {
    const s = song([srcTrack(0, note(45))]); // A2 = 110 Hz
    const { script } = compile(
      s,
      project([arrangement({ slots: ["wave"], instrumentId: "wave-bass" })]),
      GB_PROFILE,
    );
    const wave = channel(script, "wave");
    expect(wave.period[0]).toBe(1452);
    expect(wave.volume[0]).toBe(15);
    expect(wave.duty[0]).toBe(0); // triangle-ish preset index
  });

  it("organ selects wave preset 2", () => {
    const s = song([srcTrack(0, note(57))]);
    const { script } = compile(
      s,
      project([arrangement({ slots: ["wave"], instrumentId: "organ" })]),
      GB_PROFILE,
    );
    expect(channel(script, "wave").duty[0]).toBe(2);
  });

  it("writes the track pan into owned channels (hard pan left)", () => {
    const s = song([srcTrack(0, note(69))]);
    const { script } = compile(s, project([arrangement({ pan: 1 })]), GB_PROFILE);
    expect(channel(script, "p1").pan[0]).toBe(1);
    expect(channel(script, "p2").pan[0]).toBe(3); // unowned channels stay both
  });
});

describe("remapForChip", () => {
  const tracks = [
    arrangement({ id: "bass", slots: ["tri"], instrumentId: "tri-bass" }),
    arrangement({ id: "lead", slots: ["p1"], instrumentId: "square-lead" }),
  ];

  it("nes → gb: tri slot becomes wave, tri instruments become wave-bass", () => {
    const out = remapForChip(tracks, "gb");
    expect(out[0].slots).toEqual(["wave"]);
    expect(out[0].instrumentId).toBe("wave-bass");
    expect(out[1].slots).toEqual(["p1"]); // untouched
    expect(out[1].instrumentId).toBe("square-lead");
  });

  it("gb → nes: wave slot becomes tri, wave instruments become tri-bass", () => {
    const gbTracks = [arrangement({ id: "x", slots: ["wave"], instrumentId: "organ" })];
    const out = remapForChip(gbTracks, "nes");
    expect(out[0].slots).toEqual(["tri"]);
    expect(out[0].instrumentId).toBe("tri-bass");
  });

  it("round-trips", () => {
    const there = remapForChip(tracks, "gb");
    const back = remapForChip(there, "nes");
    expect(back[0].slots).toEqual(["tri"]);
    expect(back[0].instrumentId).toBe("tri-bass");
  });
});
