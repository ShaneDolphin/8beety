import { describe, expect, it } from "vitest";
import {
  gbPulseFreq,
  gbPulsePeriod,
  gbWaveFreq,
  gbWavePeriod,
  midiToFreq,
} from "../src/engine/pitch";

describe("gb pulse period (f = 131072/(2048-x))", () => {
  it("A4 round-trips through the 11-bit register with authentic detune", () => {
    const x = gbPulsePeriod(440);
    expect(x).toBe(1750); // round(2048 - 131072/440)
    expect(gbPulseFreq(1750)).toBeCloseTo(439.8, 1);
  });
  it("rejects frequencies below the register range (< 64 Hz)", () => {
    expect(gbPulsePeriod(60)).toBeNull();
  });
  it("covers the top of the MIDI range", () => {
    const x = gbPulsePeriod(midiToFreq(119)); // ~9397 Hz
    expect(x).not.toBeNull();
    expect(x!).toBeLessThanOrEqual(2047);
  });
});

describe("gb wave period (f = 65536/(2048-x))", () => {
  it("A2 = 110 Hz", () => {
    const x = gbWavePeriod(110);
    expect(x).toBe(1452); // round(2048 - 65536/110)
    expect(gbWaveFreq(1452)).toBeCloseTo(110, 0);
  });
  it("sounds one octave below pulse at the same register value", () => {
    expect(gbWaveFreq(1750)).toBeCloseTo(gbPulseFreq(1750) / 2, 3);
  });
  it("reaches an octave lower than pulse (down to 32 Hz)", () => {
    expect(gbWavePeriod(33)).not.toBeNull();
    expect(gbWavePeriod(30)).toBeNull();
  });
});
