import { describe, expect, it } from "vitest";
import {
  detectChord,
  detectKey,
  numeralFor,
  pcForNumeral,
  scalePcs,
} from "../src/theory/theory";

describe("detectChord (pitch-class sets, root prefers the bass)", () => {
  it("detects root-position triads", () => {
    expect(detectChord([60, 64, 67])).toMatchObject({ rootPc: 0, quality: "maj", label: "C" });
    expect(detectChord([57, 60, 64])).toMatchObject({ rootPc: 9, quality: "min", label: "Am" });
  });

  it("handles inversions by falling back through candidate roots", () => {
    expect(detectChord([64, 67, 72])).toMatchObject({ rootPc: 0, quality: "maj", label: "C" }); // C/E
  });

  it("detects sevenths and extensions", () => {
    expect(detectChord([57, 60, 64, 67])).toMatchObject({ quality: "min7", label: "Am7" });
    expect(detectChord([55, 59, 62, 65])).toMatchObject({ quality: "dom7", label: "G7" });
    expect(detectChord([60, 64, 67, 71])).toMatchObject({ quality: "maj7", label: "Cmaj7" });
    expect(detectChord([60, 64, 67, 71, 74])).toMatchObject({ quality: "maj9", label: "Cmaj9" });
  });

  it("prefers the bass root when a sus chord is ambiguous", () => {
    // {C D G} is both Csus2 and Gsus4; bass C wins
    expect(detectChord([60, 62, 67])).toMatchObject({ rootPc: 0, quality: "sus2" });
    expect(detectChord([55, 60, 62])).toMatchObject({ rootPc: 7, quality: "sus4" });
  });

  it("falls back to a plain triad guess for partial chords", () => {
    expect(detectChord([60, 67])).toMatchObject({ rootPc: 0, quality: "maj" }); // power chord
    expect(detectChord([])).toBeNull();
  });
});

describe("detectKey (Krumhansl correlation)", () => {
  const note = (midi: number, durationTicks = 96) => ({ midi, durationTicks });

  it("hears C major in diatonic material anchored on C and G", () => {
    const notes = [
      note(60, 384), note(64), note(67, 192), note(65), note(62),
      note(71), note(69), note(60, 384), note(67, 192),
    ];
    expect(detectKey(notes)).toMatchObject({ tonicPc: 0, mode: "major", label: "C major" });
  });

  it("hears A minor in minor material anchored on A", () => {
    const notes = [
      note(69, 384), note(72, 192), note(76, 192), note(67), note(65),
      note(74), note(69, 384), note(72, 192), note(68),
    ];
    expect(detectKey(notes)).toMatchObject({ tonicPc: 9, mode: "minor", label: "A minor" });
  });
});

describe("numerals", () => {
  const cMajor = { tonicPc: 0, mode: "major" as const, label: "C major" };
  const aMinor = { tonicPc: 9, mode: "minor" as const, label: "A minor" };

  it("maps chords to numerals in major", () => {
    expect(numeralFor(0, "maj", cMajor)).toBe("I");
    expect(numeralFor(9, "min", cMajor)).toBe("vi");
    expect(numeralFor(7, "dom7", cMajor)).toBe("V");
    expect(numeralFor(2, "min7", cMajor)).toBe("ii");
    expect(numeralFor(1, "maj", cMajor)).toBeNull(); // chromatic
  });

  it("maps chords to numerals in minor", () => {
    expect(numeralFor(9, "min", aMinor)).toBe("i");
    expect(numeralFor(5, "maj", aMinor)).toBe("VI");
    expect(numeralFor(7, "maj", aMinor)).toBe("VII");
  });

  it("pcForNumeral inverts numeralFor", () => {
    expect(pcForNumeral("vi", cMajor)).toBe(9);
    expect(pcForNumeral("VII", aMinor)).toBe(7);
    expect(pcForNumeral("iv", aMinor)).toBe(2);
  });

  it("scalePcs matches the mode", () => {
    expect(scalePcs(cMajor)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scalePcs(aMinor)).toEqual([9, 11, 0, 2, 4, 5, 7]);
  });
});
