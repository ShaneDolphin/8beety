// tests/dsp-fm.test.ts
import { describe, expect, it } from "vitest";
import { FM_PATCHES, FmChannel } from "../src/audio/apu-worklet";
import { ymPack } from "../src/engine/pitch";

const SR = 44100;
const A440 = ymPack(440) as number;

function run(ch: FmChannel, n: number, packed = A440, vol = 15): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ch.sample(packed, vol, 0, i === 0);
  return out;
}

describe("FmChannel", () => {
  it("is silent before key-on and sounds after", () => {
    const ch = new FmChannel(SR);
    expect(ch.sample(A440, 15, 0, false)).toBe(0);
    const out = run(new FmChannel(SR), 2000);
    expect(Math.max(...out.map(Math.abs))).toBeGreaterThan(1);
  });
  it("oscillates near the packed frequency", () => {
    const out = run(new FmChannel(SR), SR / 2);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1] <= 0 && out[i] > 0) crossings++;
    const measured = crossings / 0.5;
    expect(measured).toBeGreaterThan(440 * 0.9);
    expect(measured).toBeLessThan(440 * 2.2); // harmonics may add crossings
  });
  it("releases toward silence on key-off (volume 0)", () => {
    const ch = new FmChannel(SR);
    run(ch, 4000);
    let last = 0;
    for (let i = 0; i < SR; i++) last = ch.sample(A440, 0, 0, false);
    expect(Math.abs(last)).toBeLessThan(0.05);
  });
  it("has eight patches with four ops each", () => {
    expect(FM_PATCHES).toHaveLength(8);
    for (const p of FM_PATCHES) {
      expect(p.ops).toHaveLength(4);
      expect(p.algorithm).toBeGreaterThanOrEqual(0);
      expect(p.algorithm).toBeLessThan(8);
    }
  });
  it("retrigger restarts the attack (louder than late-decay level)", () => {
    const ch = new FmChannel(SR);
    const decayed = run(ch, SR); // 1s in, envelopes have decayed
    const tail = Math.max(...decayed.slice(-500).map(Math.abs));
    const retrig = run(ch, 2000); // trig=true on first sample again
    expect(Math.max(...retrig.map(Math.abs))).toBeGreaterThanOrEqual(tail);
  });
});
