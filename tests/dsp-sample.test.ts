// tests/dsp-sample.test.ts
import { describe, expect, it } from "vitest";
import { buildSampleBank, EchoBus, SAMPLE_INDEX, SampleVoice } from "../src/audio/apu-worklet";

const SR = 44100;

describe("buildSampleBank", () => {
  const bank = buildSampleBank();
  it("has 13 samples in the documented order", () => {
    expect(bank).toHaveLength(13);
    expect(SAMPLE_INDEX.kick).toBe(7);
  });
  it("is deterministic", () => {
    const again = buildSampleBank();
    expect(again[SAMPLE_INDEX.strings].data.slice(0, 64)).toEqual(bank[SAMPLE_INDEX.strings].data.slice(0, 64));
  });
  it("melodic samples loop, drums are one-shots", () => {
    expect(bank[SAMPLE_INDEX.strings].loopStart).not.toBeNull();
    expect(bank[SAMPLE_INDEX.kick].loopStart).toBeNull();
  });
  it("stays within +/-1", () => {
    for (const s of bank) for (const v of s.data) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe("SampleVoice", () => {
  const bank = buildSampleBank();
  it("plays at unity pitch and volume", () => {
    const v = new SampleVoice(SR, bank);
    let peak = 0;
    for (let i = 0; i < 4000; i++) peak = Math.max(peak, Math.abs(v.sample(0x1000, 15, SAMPLE_INDEX.epiano, i === 0, false)));
    expect(peak).toBeGreaterThan(1);
  });
  it("one-shot drums end (silence after the sample runs out)", () => {
    const v = new SampleVoice(SR, bank);
    for (let i = 0; i < SR * 2; i++) v.sample(0x1000, 15, SAMPLE_INDEX.kick, i === 0, false);
    expect(v.sample(0x1000, 15, SAMPLE_INDEX.kick, false, false)).toBe(0);
  });
  it("looped samples sustain", () => {
    const v = new SampleVoice(SR, bank);
    let last = 0;
    for (let i = 0; i < SR * 2; i++) last = Math.abs(v.sample(0x1000, 15, SAMPLE_INDEX.strings, i === 0, false)) || last;
    expect(last).toBeGreaterThan(0);
  });
});

describe("EchoBus", () => {
  it("echoes an impulse and stays stable", () => {
    const e = new EchoBus(SR);
    let [l] = e.process(1, 1);
    let peakLate = 0;
    for (let i = 0; i < SR; i++) {
      [l] = e.process(0, 0);
      if (i > SR * 0.05) peakLate = Math.max(peakLate, Math.abs(l));
    }
    expect(peakLate).toBeGreaterThan(0.01); // an echo exists
    for (let i = 0; i < SR * 10; i++) [l] = e.process(0, 0);
    expect(Math.abs(l)).toBeLessThan(0.001); // and it dies out
  });
});
