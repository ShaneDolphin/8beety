import { describe, expect, it } from "vitest";
import { stepLfsr } from "../src/audio/apu-worklet";

function outputs(shortMode: boolean, n: number): number[] {
  let reg = 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(reg & 1);
    reg = stepLfsr(reg, shortMode);
  }
  return out;
}

function cycleLength(shortMode: boolean): number {
  let reg = 1;
  for (let i = 1; i <= 40000; i++) {
    reg = stepLfsr(reg, shortMode);
    if (reg === 1) return i;
  }
  return -1;
}

describe("NES noise LFSR", () => {
  it("long mode: first 16 outputs from seed 1 (hand-derived from bit0^bit1 feedback)", () => {
    expect(outputs(false, 16)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
  it("long mode: maximal 32767-step period, never reaches 0", () => {
    expect(cycleLength(false)).toBe(32767);
    let reg = 1;
    for (let i = 0; i < 32767; i++) {
      reg = stepLfsr(reg, false);
      expect(reg).not.toBe(0);
    }
  });
  it("short mode: short metallic loop (93 or 31 steps), distinct from long mode", () => {
    const len = cycleLength(true);
    expect([93, 31]).toContain(len);
  });
  it("register stays within 15 bits", () => {
    let reg = 1;
    for (let i = 0; i < 1000; i++) {
      reg = stepLfsr(reg, i % 2 === 0);
      expect(reg).toBeLessThan(1 << 15);
      expect(reg).toBeGreaterThan(0);
    }
  });
});
