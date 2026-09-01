import { describe, expect, it } from "vitest";
import { autoArrange } from "../src/engine/auto-arrange";
import { defaultProject } from "../src/engine/project";
import type { Note, Song, SourceTrack } from "../src/engine/song";

function notesAt(midis: number[], poly = 1): Note[] {
  // One note per beat; `poly` stacks chords to raise maxPolyphony.
  const notes: Note[] = [];
  midis.forEach((m, i) => {
    for (let v = 0; v < poly; v++) {
      notes.push({ tick: i * 96, durationTicks: 90, midi: m + v * 4, velocity: 100 });
    }
  });
  return notes;
}

function track(index: number, name: string, midis: number[], opts?: Partial<SourceTrack>): SourceTrack {
  const notes = opts?.notes ?? notesAt(midis, 1);
  const pitches = notes.map((n) => n.midi);
  return {
    index,
    name,
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
    ppq: 96,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks: 96 * 8,
    tracks,
  };
}

describe("autoArrange", () => {
  it("lead → p1, second melody → p2, lowest → tri, drums unassigned", () => {
    const s = song([
      track(0, "Bass", [36, 38, 40]),
      track(1, "Melody", [72, 74, 76]),
      track(2, "Harmony", [60, 62, 64]),
      track(3, "Drums", [38, 38], { isDrums: true }),
    ]);
    const { tracks, assignedCount } = autoArrange(s);
    expect(tracks).toHaveLength(4);
    const byIndex = (i: number) => tracks.find((t) => t.sourceIndex === i)!;
    expect(byIndex(1).slots).toEqual(["p1"]);
    expect(byIndex(1).instrumentId).toBe("square-lead");
    expect(byIndex(1).polyMode).toBe("top");
    expect(byIndex(2).slots).toEqual(["p2"]);
    expect(byIndex(2).instrumentId).toBe("thin-lead");
    expect(byIndex(0).slots).toEqual(["tri"]);
    expect(byIndex(0).instrumentId).toBe("tri-bass");
    expect(byIndex(0).polyMode).toBe("bottom");
    expect(byIndex(3).slots).toEqual(["noise"]); // drums land on the noise channel
    expect(assignedCount).toBe(4);
  });

  it("fills a free Pulse 2 with the most polyphonic remaining track as Arp Chord", () => {
    const s = song([
      track(0, "Tune", [72, 74]),
      track(1, "Bass", [36, 38]),
      track(2, "Pads", [60, 62], { maxPolyphony: 4, notes: notesAt([60, 62], 4) }),
    ]);
    const { tracks } = autoArrange(s);
    const byIndex = (i: number) => tracks.find((t) => t.sourceIndex === i)!;
    expect(byIndex(0).slots).toEqual(["p1"]);
    expect(byIndex(1).slots).toEqual(["tri"]);
    expect(byIndex(2).slots).toEqual(["p2"]);
    expect(byIndex(2).instrumentId).toBe("arp-chord");
    expect(byIndex(2).polyMode).toBe("arp");
  });

  it("spreads a lone polyphonic track across tri/p1/p2 with split (piano-only case)", () => {
    const s = song([
      track(0, "Piano", [48, 60, 64], { maxPolyphony: 4, notes: notesAt([48, 52], 4) }),
    ]);
    const { tracks, assignedCount } = autoArrange(s);
    expect(tracks[0].slots).toEqual(["tri", "p1", "p2"]);
    expect(tracks[0].polyMode).toBe("split");
    expect(tracks[0].instrumentId).toBe("arp-chord");
    expect(assignedCount).toBe(1);
  });

  it("with one melodic track, assigns only p1", () => {
    const s = song([track(0, "Solo", [60, 62, 64])]);
    const { tracks } = autoArrange(s);
    expect(tracks[0].slots).toEqual(["p1"]);
  });

  it("prefers low-polyphony tracks for the lead", () => {
    const s = song([
      track(0, "Chords", [70, 72], { maxPolyphony: 4, notes: notesAt([70, 72], 4) }),
      track(1, "Tune", [69, 71]),
    ]);
    const { tracks } = autoArrange(s);
    const byIndex = (i: number) => tracks.find((t) => t.sourceIndex === i)!;
    expect(byIndex(1).slots).toEqual(["p1"]); // mono tune wins over higher chords
  });
});

describe("defaultProject", () => {
  it("uses the song tempo and NES chip with flatten mode", () => {
    const s = song([track(0, "Solo", [60])]);
    const p = defaultProject(s);
    expect(p.version).toBe(1);
    expect(p.chip).toBe("nes");
    expect(p.bpm).toBe(120);
    expect(p.tempoMode).toBe("flatten");
    expect(p.outputFilter).toBe(true);
    expect(p.tracks).toHaveLength(1);
    expect(p.tracks[0].volume).toBe(15);
    expect(p.tracks[0].mute).toBe(false);
  });
});
