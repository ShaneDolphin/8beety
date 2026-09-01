import { describe, expect, it } from "vitest";
import { ApuCore } from "../src/audio/apu-worklet";
import { buildM1Fixture } from "../src/engine/fixtures/m1-fixture";
import type { ChannelFrames, FrameScript } from "../src/engine/frame-script";

const SR = 44100;

function renderWhole(core: ApuCore, samples: number): Float32Array {
  const out = new Float32Array(samples);
  core.render(out, null);
  return out;
}

function renderChunked(core: ApuCore, samples: number, chunk = 128): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += chunk) {
    const L = out.subarray(i, Math.min(i + chunk, samples));
    core.render(L, null);
  }
  return out;
}

function freshCore(script: FrameScript): ApuCore {
  const core = new ApuCore(SR);
  core.load(script);
  core.play();
  return core;
}

describe("ApuCore (shared realtime/offline engine)", () => {
  it("renders identically in one block and in 128-sample quanta (WAV parity)", () => {
    const script = buildM1Fixture();
    const n = SR; // one second
    const whole = renderWhole(freshCore(script), n);
    const chunked = renderChunked(freshCore(script), n);
    expect(whole.length).toBe(chunked.length);
    for (let i = 0; i < n; i++) {
      if (whole[i] !== chunked[i]) throw new Error(`diverged at sample ${i}`);
    }
    // and it actually made sound
    let rms = 0;
    for (let i = 0; i < n; i++) rms += whole[i] * whole[i];
    expect(Math.sqrt(rms / n)).toBeGreaterThan(0.01);
  });

  it("is deterministic across reloads", () => {
    const script = buildM1Fixture();
    const a = renderWhole(freshCore(script), 20000);
    const b = renderWhole(freshCore(script), 20000);
    expect(a).toEqual(b);
  });

  it("loops when a loop range is set", () => {
    const script = buildM1Fixture(); // 480 frames = 8 s
    const core = freshCore(script);
    core.setLoop([0, 60]); // one-second loop
    const out = renderWhole(core, SR * 3);
    let tail = 0;
    for (let i = SR * 2; i < SR * 3; i++) tail += out[i] * out[i];
    expect(Math.sqrt(tail / SR)).toBeGreaterThan(0.01); // still sounding in second 3
    expect(core.frame).toBeLessThan(60);
  });

  it("stops and reports ended at the end of the script", () => {
    const script = buildM1Fixture();
    const core = freshCore(script);
    let ended = false;
    core.onEnded = () => {
      ended = true;
    };
    renderWhole(core, SR * 9); // script is 8 s
    expect(ended).toBe(true);
    expect(core.playing).toBe(false);
  });

  it("renders gb scripts in stereo with hard pans", () => {
    const N = 60;
    const mk = (id: string, pan: number): ChannelFrames => ({
      id,
      period: new Uint16Array(N),
      volume: new Uint8Array(N),
      duty: new Uint8Array(N),
      pan: new Uint8Array(N).fill(pan),
    });
    const p1 = mk("p1", 1);
    const p2 = mk("p2", 2);
    p1.period.fill(1750);
    p1.volume.fill(15);
    p1.duty.fill(2);
    p2.period.fill(1849);
    p2.volume.fill(15);
    p2.duty.fill(1);
    const script: FrameScript = {
      chip: "gb",
      fps: 60,
      frameCount: N,
      channels: [p1, p2, mk("wave", 3), mk("noise", 3)],
      barStarts: [0],
    };
    const core = freshCore(script);
    const L = new Float32Array(SR / 2);
    const R = new Float32Array(SR / 2);
    core.render(L, R);
    let diff = 0;
    for (let i = 0; i < L.length; i++) diff += Math.abs(L[i] - R[i]);
    expect(diff / L.length).toBeGreaterThan(0.01);
  });
});
