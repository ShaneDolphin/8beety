import { describe, expect, it } from "vitest";
import {
  NoiseChannel,
  OnePoleHighPass,
  OnePoleLowPass,
  PulseChannel,
  TRI_SEQUENCE,
  TriangleChannel,
  nesMix,
} from "../src/audio/apu-worklet";

const SR = 48000;

describe("nesMix (NESdev nonlinear mixer)", () => {
  it("is silent at zero input", () => {
    expect(nesMix(0, 0, 0, 0)).toBe(0);
  });
  it("both pulses at 15: 95.88 / (8128/30 + 100)", () => {
    expect(nesMix(15, 15, 0, 0)).toBeCloseTo(0.25848, 4);
  });
  it("triangle at 15: 159.79 / (1/(15/8227) + 100)", () => {
    expect(nesMix(0, 0, 15, 0)).toBeCloseTo(0.24642, 4);
  });
  it("is nonlinear: one pulse at 15 is more than half of two at 15", () => {
    expect(nesMix(15, 0, 0, 0)).toBeGreaterThan(nesMix(15, 15, 0, 0) / 2);
  });
});

describe("PulseChannel", () => {
  it.each([
    [0, 0.125],
    [1, 0.25],
    [2, 0.5],
  ])("duty index %i is high ~%f of the cycle", (dutyIndex, duty) => {
    const ch = new PulseChannel(SR);
    let high = 0;
    const n = 48000;
    for (let i = 0; i < n; i++) if (ch.sample(253, 15, dutyIndex) > 0) high++;
    expect(high / n).toBeGreaterThan(duty - 0.02);
    expect(high / n).toBeLessThan(duty + 0.02);
  });
  it("outputs 0 when period is 0 (off)", () => {
    const ch = new PulseChannel(SR);
    expect(ch.sample(0, 15, 2)).toBe(0);
  });
});

describe("TriangleChannel", () => {
  it("uses the 32-step 4-bit staircase", () => {
    expect(TRI_SEQUENCE).toHaveLength(32);
    expect(Math.max(...TRI_SEQUENCE)).toBe(15);
    expect(Math.min(...TRI_SEQUENCE)).toBe(0);
    expect(TRI_SEQUENCE.slice(0, 4)).toEqual([15, 14, 13, 12]);
  });
  it("emits only values from the sequence", () => {
    const ch = new TriangleChannel(SR);
    for (let i = 0; i < 4096; i++) {
      expect(TRI_SEQUENCE).toContain(ch.sample(507, true));
    }
  });
});

describe("NoiseChannel", () => {
  it("emits either 0 or the given volume", () => {
    const ch = new NoiseChannel(SR);
    const seen = new Set<number>();
    for (let i = 0; i < 4096; i++) seen.add(ch.sample(16, 9, false));
    expect([...seen].sort()).toEqual([0, 9]);
  });
});

describe("post-filters", () => {
  it("high-pass blocks DC", () => {
    const hp = new OnePoleHighPass(90, SR);
    let y = 0;
    for (let i = 0; i < SR; i++) y = hp.process(1);
    expect(Math.abs(y)).toBeLessThan(0.001);
  });
  it("low-pass passes DC", () => {
    const lp = new OnePoleLowPass(14000, SR);
    let y = 0;
    for (let i = 0; i < SR; i++) y = lp.process(1);
    expect(y).toBeCloseTo(1, 3);
  });
});
