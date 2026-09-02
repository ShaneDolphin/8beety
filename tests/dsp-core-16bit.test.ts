import { describe, expect, it } from "vitest";
import { ApuCore, SAMPLE_INDEX } from "../src/audio/apu-worklet";
import type { FrameScript } from "../src/engine/frame-script";
import { spcPitch, ymPack } from "../src/engine/pitch";

const SR = 44100;
const N = 120; // 2s

function channel(n: number) {
  return {
    id: `c${n}`, period: new Uint16Array(N), volume: new Uint8Array(N),
    duty: new Uint8Array(N), pan: new Uint8Array(N).fill(3), trig: new Uint8Array(N),
  };
}

function script(chip: "sega" | "snes", lanes: number): FrameScript {
  return { chip, fps: 60, frameCount: N, channels: Array.from({ length: lanes }, (_, i) => channel(i)), barStarts: [0] };
}

function rms(core: ApuCore, samples: number): number {
  const l = new Float32Array(samples);
  const r = new Float32Array(samples);
  core.render(l, r);
  let acc = 0;
  for (const v of l) acc += v * v;
  return Math.sqrt(acc / samples);
}

describe("ApuCore 16-bit chips", () => {
  it("sega FM lane produces audio and stays in range", () => {
    const s = script("sega", 6);
    s.channels[0].period.fill(ymPack(440) as number);
    s.channels[0].volume.fill(12);
    s.channels[0].trig![0] = 1;
    const core = new ApuCore(SR);
    core.load(s);
    core.play();
    const level = rms(core, SR);
    expect(level).toBeGreaterThan(0.005);
    expect(level).toBeLessThan(0.5);
  });
  it("snes voice plays a sample with echo tail after note ends", () => {
    const s = script("snes", 8);
    s.channels[0].period.fill(spcPitch(261.6256) as number, 0, 30);
    s.channels[0].volume.fill(12, 0, 30);
    s.channels[0].duty.fill(SAMPLE_INDEX.strings, 0, 30);
    s.channels[0].trig![0] = 1;
    const core = new ApuCore(SR);
    core.load(s);
    core.play();
    const during = rms(core, Math.round(SR * 0.4));
    const tail = rms(core, Math.round(SR * 0.2)); // right after the 0.5s note
    expect(during).toBeGreaterThan(0.005);
    expect(tail).toBeGreaterThan(0.0005); // echo audible
  });
  it("hard-panned sega lane is silent on the off side", () => {
    const s = script("sega", 6);
    s.channels[0].period.fill(ymPack(440) as number);
    s.channels[0].volume.fill(12);
    s.channels[0].trig![0] = 1;
    s.channels[0].pan.fill(1); // L only
    const core = new ApuCore(SR);
    core.load(s);
    core.play();
    const l = new Float32Array(SR / 2);
    const r = new Float32Array(SR / 2);
    core.render(l, r);
    expect(Math.max(...l.map(Math.abs))).toBeGreaterThan(0.005);
    expect(Math.max(...r.map(Math.abs))).toBeLessThan(1e-6);
  });
});
