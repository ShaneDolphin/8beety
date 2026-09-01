import { describe, expect, it } from "vitest";
import { reduceChord } from "../src/engine/chord-reduce";

describe("reduceChord (§7.3: cap 4; drop 5th, then doubled octaves; keep root/3rd/7th/extensions)", () => {
  it("passes small chords through sorted", () => {
    expect(reduceChord([67, 60, 64])).toEqual([60, 64, 67]);
    expect(reduceChord([60])).toEqual([60]);
  });

  it("dedupes unisons", () => {
    expect(reduceChord([60, 60, 64, 67, 67])).toEqual([60, 64, 67]);
  });

  it("drops the 5th first: C9 keeps root, 3rd, 7th, 9th", () => {
    // C E G Bb D
    expect(reduceChord([60, 64, 67, 70, 74])).toEqual([60, 64, 70, 74]);
  });

  it("drops doubled octaves when there is no 5th to drop", () => {
    // C3 C4 E4 B4 E5 — E5 doubles E4's pitch class
    expect(reduceChord([48, 60, 64, 71, 76])).toEqual([48, 60, 64, 71]);
  });

  it("caps at 4 even for dense clusters", () => {
    const out = reduceChord([60, 61, 62, 63, 65, 66]);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(60); // root always kept
  });

  it("keeps ascending order", () => {
    const out = reduceChord([74, 60, 70, 64, 67]);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });
});
