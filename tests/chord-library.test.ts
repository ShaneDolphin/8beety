import { describe, expect, it } from "vitest";
import library from "../src/theory/chord-library.json";

const VALID_NUMERALS = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii"]);
const VALID_QUALITIES = new Set([
  "maj", "min", "maj7", "min7", "dom7", "sus2", "sus4", "add9", "min9", "maj9",
]);

describe("chord-library.json", () => {
  it("carries attribution and both modes", () => {
    expect(library.source).toMatch(/free-midi-chords.*MIT/);
    const modes = new Set(library.progressions.map((p) => p.mode));
    expect(modes).toEqual(new Set(["major", "minor"]));
  });

  it("has a healthy number of unique progressions", () => {
    expect(library.progressions.length).toBeGreaterThan(80);
    const keys = new Set(
      library.progressions.map((p) => `${p.mode}|${p.numerals.join(" ")}|${p.qualities.join(" ")}`),
    );
    expect(keys.size).toBe(library.progressions.length);
  });

  it("every progression is well-formed", () => {
    for (const p of library.progressions) {
      expect(p.numerals.length).toBe(p.qualities.length);
      expect(p.bars).toBe(p.numerals.length);
      for (const n of p.numerals) expect(VALID_NUMERALS.has(n.toLowerCase())).toBe(true);
      for (const q of p.qualities) expect(VALID_QUALITIES.has(q)).toBe(true);
    }
  });

  it("ships the §8.2 voicings", () => {
    expect(library.voicings.maj).toEqual([0, 4, 7]);
    expect(library.voicings.min9).toEqual([0, 3, 7, 10, 14]);
    expect(Object.keys(library.voicings)).toHaveLength(10);
  });

  it("contains the classic pop progression", () => {
    expect(
      library.progressions.some((p) => p.numerals.join(" ") === "I V vi IV"),
    ).toBe(true);
  });
});
