import { describe, expect, it } from "vitest";
import { GB_PROFILE, NES_PROFILE, SEGA_PROFILE, SNES_PROFILE } from "../src/engine/chip-profiles";
import type { Project, TrackArrangement } from "../src/engine/project";
import { lanesFor } from "../src/viz/lanes";

function arr(overrides: Partial<TrackArrangement>): TrackArrangement {
  return {
    id: "t",
    sourceIndex: 0,
    name: "Track",
    slots: [],
    instrumentId: "square-lead",
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

function project(tracks: TrackArrangement[]): Project {
  return {
    version: 1,
    chip: "nes",
    bpm: 120,
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks,
  };
}

describe("lanesFor", () => {
  it("uses canonical labels for unowned channels, in channel order", () => {
    const lanes = lanesFor(project([]), NES_PROFILE);
    expect(lanes.map((l) => l.label)).toEqual(["VOCALS", "GUITAR", "BASS", "DRUMS"]);
    expect(lanes.map((l) => l.kind)).toEqual(["pitch", "pitch", "pitch", "drums"]);
    expect(lanes.map((l) => l.trackName)).toEqual([null, null, null, null]);
  });

  it("keyword-matches owning track names (the Creed-style arrangement)", () => {
    const lanes = lanesFor(
      project([
        arr({ id: "a", name: "Guitar 1", slots: ["p1"] }),
        arr({ id: "b", name: "Guitar 2", slots: ["p2"] }),
        arr({ id: "c", name: "Bass", slots: ["tri"] }),
        arr({ id: "d", name: "Drumkit", slots: ["noise"] }),
      ]),
      NES_PROFILE,
    );
    expect(lanes.map((l) => l.label)).toEqual(["GUITAR", "GUITAR", "BASS", "DRUMS"]);
    expect(lanes[0].trackName).toBe("Guitar 1");
  });

  it("recognizes vocal/lead/melody keywords for the vocals lane", () => {
    const lanes = lanesFor(project([arr({ name: "Lead Vox", slots: ["p1"] })]), NES_PROFILE);
    expect(lanes[0].label).toBe("VOCALS");
    const melody = lanesFor(project([arr({ name: "Melody", slots: ["p1"] })]), NES_PROFILE);
    expect(melody[0].label).toBe("VOCALS");
  });

  it("falls back to the canonical label when the name matches nothing", () => {
    const lanes = lanesFor(project([arr({ name: "Sax Solo", slots: ["p2"] })]), NES_PROFILE);
    expect(lanes[1].label).toBe("GUITAR");
    expect(lanes[1].trackName).toBe("Sax Solo");
  });

  it("labels the GB wave channel as the bass lane", () => {
    const lanes = lanesFor(project([]), GB_PROFILE);
    expect(lanes.map((l) => l.label)).toEqual(["VOCALS", "GUITAR", "BASS", "DRUMS"]);
  });

  it("produces one lane per channel for 16-bit chips", () => {
    const p = project([]); // existing helper in this file
    expect(lanesFor(p, SEGA_PROFILE)).toHaveLength(6);
    expect(lanesFor(p, SNES_PROFILE)).toHaveLength(8);
    expect(lanesFor(p, SEGA_PROFILE)[5].kind).toBe("drums");
  });
});
