import { describe, expect, it } from "vitest";
import { midiToFreq, spcFreq, spcPitch, ymFreq, ymPack } from "../src/engine/pitch";

describe("YM2612 fnum/block", () => {
  it("round-trips A440 within a cent", () => {
    const packed = ymPack(440);
    expect(packed).not.toBeNull();
    const back = ymFreq(packed as number);
    expect(Math.abs(1200 * Math.log2(back / 440))).toBeLessThan(1);
  });
  it("uses 11-bit fnum and 3-bit block", () => {
    for (const midi of [24, 48, 69, 96, 108]) {
      const p = ymPack(midiToFreq(midi));
      expect(p).not.toBeNull();
      expect((p as number) & 0x7ff).toBeLessThan(2048);
      expect((p as number) >> 11).toBeLessThan(8);
    }
  });
  it("rejects frequencies outside block range", () => {
    expect(ymPack(0.01)).toBeNull();
    expect(ymPack(30000)).toBeNull();
  });
});

describe("SPC pitch", () => {
  it("plays C4 at rate 1.0", () => {
    expect(spcPitch(261.6256)).toBe(0x1000);
  });
  it("round-trips within a cent across the melodic range", () => {
    for (const midi of [36, 48, 60, 72, 83]) {
      const f = midiToFreq(midi);
      const p = spcPitch(f);
      expect(p).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(spcFreq(p as number) / f))).toBeLessThan(1);
    }
  });
  it("caps at the 14-bit 4x-up hardware limit", () => {
    expect(spcPitch(261.6256 * 4.01)).toBeNull();
    expect(spcPitch(261.6256 * 3.99)).not.toBeNull();
  });
});
