import { describe, expect, it } from "vitest";
import { segmentTrack } from "../src/theory/detect";
import { enrichChord, substitutionsFor } from "../src/theory/enrich";
import { chordMidis, deriveChordTrack } from "../src/theory/derive";
import type { KeyInfo } from "../src/theory/theory";
import type { Note, Song, SourceTrack } from "../src/engine/song";

const PPQ = 96;
const BAR = PPQ * 4;

const cMajor: KeyInfo = { tonicPc: 0, mode: "major", label: "C major" };

function track(notes: Note[], index = 0): SourceTrack {
  const pitches = notes.map((n) => n.midi);
  return {
    index,
    name: "Chords",
    midiChannel: 0,
    isDrums: false,
    notes,
    maxPolyphony: 3,
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
  };
}

function song(notes: Note[]): Song {
  return {
    name: "t.mid",
    ppq: PPQ,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks: BAR * 4,
    tracks: [track(notes)],
  };
}

const triad = (bar: number, midis: number[], len = BAR): Note[] =>
  midis.map((midi) => ({ tick: bar * BAR, durationTicks: len, midi, velocity: 100 }));

describe("segmentTrack", () => {
  it("detects one chord per bar", () => {
    const s = song([
      ...triad(0, [60, 64, 67]),
      ...triad(1, [57, 60, 64]),
      ...triad(2, [65, 69, 72]),
      ...triad(3, [55, 59, 62]),
    ]);
    const segs = segmentTrack(s, s.tracks[0]);
    expect(segs.map((x) => x.chord.label)).toEqual(["C", "Am", "F", "G"]);
    expect(segs[1]).toMatchObject({ startTick: BAR, endTick: BAR * 2 });
  });

  it("splits a bar in half when the chord changes mid-bar", () => {
    const s = song([...triad(0, [60, 64, 67], BAR / 2), ...triad(0.5, [65, 69, 72], BAR / 2)]);
    const segs = segmentTrack(s, s.tracks[0]);
    expect(segs.map((x) => x.chord.label)).toEqual(["C", "F"]);
    expect(segs[0].endTick).toBe(BAR / 2);
  });

  it("skips silent bars", () => {
    const s = song([...triad(0, [60, 64, 67]), ...triad(2, [55, 59, 62])]);
    expect(segmentTrack(s, s.tracks[0])).toHaveLength(2);
  });
});

describe("enrichChord (levels 1–2, §8.3.2)", () => {
  it("level 1 adds diatonic sevenths — the spec's own example", () => {
    expect(enrichChord(9, "min", 1, cMajor).quality).toBe("min7"); // Am → Am7
    expect(enrichChord(0, "maj", 1, cMajor).quality).toBe("maj7"); // C → Cmaj7
    expect(enrichChord(7, "maj", 1, cMajor).quality).toBe("dom7"); // G → G7
  });

  it("level 2 adds diatonic ninths", () => {
    expect(enrichChord(0, "maj", 2, cMajor).quality).toBe("maj9");
    expect(enrichChord(9, "min", 2, cMajor).quality).toBe("min9");
    // B has no diatonic ninth in C (C# is chromatic) — stays at the 7th level
    expect(enrichChord(11, "min", 2, cMajor).quality).toBe("min7");
  });

  it("level 2 uses sus when the melody sits on a 2nd or 4th", () => {
    expect(enrichChord(0, "maj", 2, cMajor, 2).quality).toBe("sus2"); // melody D over C
    expect(enrichChord(0, "maj", 2, cMajor, 5).quality).toBe("sus4"); // melody F over C
  });

  it("level 0 leaves the chord alone", () => {
    expect(enrichChord(0, "maj", 0, cMajor).quality).toBe("maj");
  });
});

describe("substitutionsFor (level 3)", () => {
  const detected = [
    { rootPc: 0, quality: "maj" as const },
    { rootPc: 7, quality: "maj" as const },
    { rootPc: 9, quality: "min" as const },
    { rootPc: 5, quality: "maj" as const },
  ]; // I V vi IV in C

  it("offers up to three same-length substitutions with matching endpoints, all diatonic", () => {
    const subs = substitutionsFor(detected, cMajor, "hopeful");
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.length).toBeLessThanOrEqual(3);
    const scale = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const sub of subs) {
      expect(sub.chords).toHaveLength(4);
      expect(sub.chords[0].rootPc).toBe(0); // starts on I
      expect(sub.chords[3].rootPc).toBe(5); // ends on IV
      for (const c of sub.chords) expect(scale.has(c.rootPc)).toBe(true);
    }
  });

  it("matches the repeating base cycle of a tiled progression", () => {
    const repeated = [...detected, ...detected]; // 8 bars = 2× (I V vi IV)
    const subs = substitutionsFor(repeated, cMajor, "hopeful");
    expect(subs.length).toBeGreaterThan(0);
    for (const sub of subs) {
      expect(sub.chords).toHaveLength(8); // tiled back to the full length
      expect(sub.chords[0].rootPc).toBe(0);
      expect(sub.chords[4].rootPc).toBe(sub.chords[0].rootPc); // second cycle repeats
    }
  });

  it("never proposes the progression itself", () => {
    const subs = substitutionsFor(detected, cMajor, "hopeful");
    for (const sub of subs) {
      const same = sub.chords.every(
        (c, i) => c.rootPc === detected[i].rootPc && c.quality === detected[i].quality,
      );
      expect(same).toBe(false);
    }
  });
});

describe("chip voicing + derived track", () => {
  it("caps chords at 4 tones and keeps the top below the melody", () => {
    const midis = chordMidis(0, "maj9", 60); // Cmaj9 has 5 tones
    expect(midis.length).toBeLessThanOrEqual(4);
    expect(Math.max(...midis)).toBeLessThan(60);
  });

  it("builds a SourceTrack with segment timings", () => {
    const segments = [
      { startTick: 0, endTick: BAR },
      { startTick: BAR, endTick: BAR * 2 },
    ];
    const chords = [
      { rootPc: 0, quality: "maj7" as const },
      { rootPc: 7, quality: "dom7" as const },
    ];
    const derived = deriveChordTrack(chords, segments, 5, "Cmaj7 chords", () => 72);
    expect(derived.index).toBe(5);
    expect(derived.name).toBe("Cmaj7 chords");
    expect(derived.notes.filter((n) => n.tick === 0).length).toBeGreaterThanOrEqual(3);
    expect(derived.notes.every((n) => n.midi < 72)).toBe(true);
    const second = derived.notes.filter((n) => n.tick === BAR);
    expect(second[0].durationTicks).toBe(BAR);
  });
});
