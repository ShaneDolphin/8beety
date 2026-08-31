import { describe, expect, it } from "vitest";
import {
  midiToFreq,
  nesPulseFreq,
  nesPulseTimer,
  nesTriangleFreq,
  nesTriangleTimer,
} from "../src/engine/pitch";

describe("midiToFreq", () => {
  it.each([
    [69, 440],
    [60, 261.626],
    [33, 55],
  ])("midi %i → %f Hz", (midi, hz) => {
    expect(midiToFreq(midi)).toBeCloseTo(hz, 2);
  });
});

describe("nes pulse timer", () => {
  it("A4 round-trips through the 11-bit timer with authentic detune", () => {
    const t = nesPulseTimer(440);
    expect(t).toBe(253); // round(1789773 / (16*440) - 1)
    expect(nesPulseFreq(253)).toBeCloseTo(440.4, 1);
  });
  it("silences when timer would be < 8 (very high pitch)", () => {
    expect(nesPulseTimer(14000)).toBeNull(); // timer would be 7
  });
  it("rejects pitches below the 11-bit range", () => {
    expect(nesPulseTimer(50)).toBeNull(); // timer would be 2236 > 2047
  });
  it("boundary: timer exactly 8 is playable", () => {
    // freq where round(cpu/(16f) - 1) === 8  → ~12429 Hz
    expect(nesPulseTimer(12429)).toBe(8);
  });
});

describe("nes triangle timer (32× divider — sounds an octave below pulse at equal timer)", () => {
  it("A2 = 110 Hz", () => {
    const t = nesTriangleTimer(110);
    expect(t).toBe(507); // round(1789773 / (32*110) - 1)
    expect(nesTriangleFreq(507)).toBeCloseTo(110.1, 1);
  });
  it("same timer value sounds one octave lower than pulse", () => {
    expect(nesTriangleFreq(253)).toBeCloseTo(nesPulseFreq(253) / 2, 3);
  });
});
