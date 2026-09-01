import { describe, expect, it } from "vitest";
import { NES_PROFILE } from "../src/engine/chip-profiles";
import { compile } from "../src/engine/compile";
import type { FrameScript } from "../src/engine/frame-script";
import { decodeProjectFile, encodeProjectFile } from "../src/engine/project-io";
import type { Project, TrackArrangement } from "../src/engine/project";
import type { Note, Song, SourceTrack } from "../src/engine/song";

const PPQ = 96; // 120 BPM: beat = 30 frames, bar = 120 frames

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

function song(tracks: SourceTrack[], durationTicks = PPQ * 16): Song {
  return {
    name: "t.mid",
    ppq: PPQ,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks,
    tracks,
  };
}

function arrangement(overrides: Partial<TrackArrangement>): TrackArrangement {
  return {
    id: "t0",
    sourceIndex: 0,
    name: "Track 1",
    slots: ["p1"],
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

function project(tracks: TrackArrangement[], overrides?: Partial<Project>): Project {
  return {
    version: 1,
    chip: "nes",
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

// One whole note per bar for 4 bars.
const barNotes: Note[] = [0, 1, 2, 3].map((bar) => ({
  tick: bar * PPQ * 4,
  durationTicks: PPQ * 4,
  midi: 69,
  velocity: 100,
}));

describe("regions (§12 M7 acceptance)", () => {
  it("bars 1–2 Square Lead, bars 3–4 Pluck on the same track", () => {
    const s = song([srcTrack(0, barNotes)]);
    const { script } = compile(
      s,
      project([
        arrangement({
          regions: [
            { startBar: 0, endBar: 2 },
            { startBar: 2, endBar: 4, instrumentId: "pluck" },
          ],
        }),
      ]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.volume[0]).toBe(12); // square lead sustain
    expect(p1.volume[100]).toBe(12); // still sustained inside bar 1
    expect(p1.duty[0]).toBe(2); // 50% duty
    expect(p1.volume[240]).toBe(15); // pluck attack at bar 3
    expect(p1.volume[249]).toBe(0); // pluck decayed
    expect(p1.duty[240]).toBe(1); // pluck's 25% duty
  });

  it("region polyMode override: top before, arp after", () => {
    const chords: Note[] = [];
    for (const bar of [0, 1, 2, 3]) {
      for (const midi of [60, 64, 67]) {
        chords.push({ tick: bar * PPQ * 4, durationTicks: PPQ * 4, midi, velocity: 100 });
      }
    }
    const s = song([srcTrack(0, chords)]);
    const { script } = compile(
      s,
      project([
        arrangement({
          regions: [
            { startBar: 0, endBar: 2 },
            { startBar: 2, endBar: 4, polyMode: "arp" },
          ],
        }),
      ]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.period[0]).toBe(p1.period[1]); // top: steady highest note
    expect(p1.period[240]).not.toBe(p1.period[241]); // arp: cycling
  });

  it("region slots override routes later bars to Pulse 2", () => {
    const s = song([srcTrack(0, barNotes)]);
    const { script } = compile(
      s,
      project([
        arrangement({
          regions: [
            { startBar: 0, endBar: 2 },
            { startBar: 2, endBar: 4, slots: ["p2"] },
          ],
        }),
      ]),
      NES_PROFILE,
    );
    expect(channel(script, "p1").volume[0]).toBeGreaterThan(0);
    expect(channel(script, "p1").volume[240]).toBe(0);
    expect(channel(script, "p2").volume[0]).toBe(0);
    expect(channel(script, "p2").volume[240]).toBeGreaterThan(0);
  });
});

describe("tweaks reach the render", () => {
  it("duty override and attack ramp are audible in the script", () => {
    const s = song([srcTrack(0, barNotes)]);
    const { script } = compile(
      s,
      project([arrangement({ tweaks: { duty: 0, attack: 4 } })]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.duty[0]).toBe(0);
    expect(Array.from(p1.volume.slice(0, 5))).toEqual([2, 5, 7, 10, 12]);
  });

  it("tweaks apply on top of region instruments too", () => {
    const s = song([srcTrack(0, barNotes)]);
    const { script } = compile(
      s,
      project([
        arrangement({
          tweaks: { duty: 3 },
          regions: [
            { startBar: 0, endBar: 2 },
            { startBar: 2, endBar: 4, instrumentId: "pluck" },
          ],
        }),
      ]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.duty[0]).toBe(3);
    expect(p1.duty[240]).toBe(3); // pluck region still gets the duty tweak
  });
});

describe("schema round-trip with regions and tweaks", () => {
  it("preserves both through encode/decode", () => {
    const p = project([
      arrangement({
        tweaks: { duty: 1, attack: 2, decay: 8, vibratoDepth: 2, vibratoDelay: 10 },
        regions: [
          { startBar: 0, endBar: 2 },
          { startBar: 2, endBar: 4, instrumentId: "pluck", polyMode: "arp", slots: ["p2"] },
        ],
      }),
    ]);
    const decoded = decodeProjectFile(JSON.parse(JSON.stringify(encodeProjectFile(p, null, null))));
    expect(decoded).not.toBeNull();
    expect(decoded!.project.tracks[0].tweaks).toEqual(p.tracks[0].tweaks);
    expect(decoded!.project.tracks[0].regions).toEqual(p.tracks[0].regions);
  });
});
