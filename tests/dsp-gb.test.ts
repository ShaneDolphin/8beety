import { describe, expect, it } from "vitest";
import {
  GbPulseChannel,
  GbVolumeLatch,
  GbWaveChannel,
  WAVE_PRESETS,
  stepGbLfsr,
} from "../src/audio/apu-worklet";

const SR = 48000;

describe("GB noise LFSR", () => {
  it("15-bit width: maximal 32767-step period from seed 0x7FFF", () => {
    let reg = 0x7fff;
    let period = -1;
    for (let i = 1; i <= 40000; i++) {
      reg = stepGbLfsr(reg, false);
      if (reg === 0x7fff) {
        period = i;
        break;
      }
    }
    expect(period).toBe(32767);
  });

  it("7-bit width settles into a 127-step loop", () => {
    let reg = 0x7fff;
    for (let i = 0; i < 32; i++) reg = stepGbLfsr(reg, true); // burn in
    const seen = reg;
    let period = -1;
    for (let i = 1; i <= 200; i++) {
      reg = stepGbLfsr(reg, true);
      if ((reg & 0x7f) === (seen & 0x7f) && period === -1 && i >= 100) period = i;
    }
    // low 7 bits cycle with period 127
    let r2 = seen;
    for (let i = 0; i < 127; i++) r2 = stepGbLfsr(r2, true);
    expect(r2 & 0x7f).toBe(seen & 0x7f);
  });

  it("stays within 15 bits and never reaches 0", () => {
    let reg = 0x7fff;
    for (let i = 0; i < 5000; i++) {
      reg = stepGbLfsr(reg, i % 2 === 0);
      expect(reg).toBeGreaterThan(0);
      expect(reg).toBeLessThan(1 << 15);
    }
  });
});

describe("WAVE_PRESETS", () => {
  it("ships four 32-sample 4-bit waves", () => {
    expect(WAVE_PRESETS).toHaveLength(4);
    for (const w of WAVE_PRESETS) {
      expect(w).toHaveLength(32);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...w)).toBeLessThanOrEqual(15);
    }
  });
  it("waves are distinct", () => {
    const keys = new Set(WAVE_PRESETS.map((w) => w.join(",")));
    expect(keys.size).toBe(4);
  });
});

describe("GbVolumeLatch (64 Hz envelope quantization)", () => {
  it("applies increases immediately", () => {
    const latch = new GbVolumeLatch(SR);
    expect(latch.next(12)).toBe(12);
  });
  it("defers decreases until a 64 Hz tick has elapsed", () => {
    const latch = new GbVolumeLatch(SR);
    latch.next(12);
    const perTick = SR / 64;
    for (let i = 0; i < perTick - 2; i++) expect(latch.next(5)).toBe(12); // still held
    latch.next(5);
    expect(latch.next(5)).toBe(5); // tick elapsed
  });
});

describe("GbPulseChannel", () => {
  it("respects the duty cycle at the GB frequency formula", () => {
    const ch = new GbPulseChannel(SR);
    let high = 0;
    const n = 48000;
    for (let i = 0; i < n; i++) if (ch.sample(1750, 15, 2) > 0) high++; // 50% duty A4
    expect(high / n).toBeGreaterThan(0.48);
    expect(high / n).toBeLessThan(0.52);
  });
  it("is silent at period 0", () => {
    expect(new GbPulseChannel(SR).sample(0, 15, 2)).toBe(0);
  });
});

describe("GbWaveChannel", () => {
  it("emits preset samples scaled by the GB volume codes", () => {
    const ch = new GbWaveChannel(SR);
    const seen = new Set<number>();
    for (let i = 0; i < 4096; i++) seen.add(ch.sample(1452, 15, 0));
    for (const v of seen) {
      expect(WAVE_PRESETS[0]).toContain(v); // full volume: raw samples
    }
    const half = new GbWaveChannel(SR);
    const seenHalf = new Set<number>();
    for (let i = 0; i < 4096; i++) seenHalf.add(half.sample(1452, 8, 0));
    expect(Math.max(...seenHalf)).toBeCloseTo(Math.max(...WAVE_PRESETS[0]) / 2, 5);
  });
});
