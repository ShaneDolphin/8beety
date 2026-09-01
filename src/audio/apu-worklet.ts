// NES 2A03 DSP. This module is loaded both as an AudioWorklet module (via
// ?worker&url) and by Vitest under Node, so it must have no runtime imports
// (type-only imports are erased) and must not touch worklet globals at the
// top level.
import type { FrameScript } from "../engine/frame-script";
import type { ApuMessage, ApuReport } from "./messages";

// 15-bit LFSR: feedback = bit0 XOR (bit6 in short mode, else bit1),
// shift right, feedback into bit 14.
export function stepLfsr(reg: number, shortMode: boolean): number {
  const tap = shortMode ? (reg >> 6) & 1 : (reg >> 1) & 1;
  const feedback = (reg & 1) ^ tap;
  return (reg >> 1) | (feedback << 14);
}

export const NES_CPU_HZ = 1789773;
export const PULSE_DUTIES = [0.125, 0.25, 0.5, 0.75];

// 15 14 … 1 0 0 1 … 14 15 (the real 2A03 order)
export const TRI_SEQUENCE = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15,
];

export class PulseChannel {
  private readonly sampleRate: number;
  private phase = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  sample(period: number, volume: number, dutyIndex: number): number {
    if (period === 0 || volume === 0) return 0;
    const freq = NES_CPU_HZ / (16 * (period + 1));
    this.phase = (this.phase + freq / this.sampleRate) % 1;
    return this.phase < PULSE_DUTIES[dutyIndex] ? volume : 0;
  }
}

export class TriangleChannel {
  private readonly sampleRate: number;
  private phase = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  sample(period: number, on: boolean): number {
    if (!on || period === 0) return 0;
    const freq = NES_CPU_HZ / (32 * (period + 1));
    this.phase = (this.phase + freq / this.sampleRate) % 1;
    return TRI_SEQUENCE[Math.floor(this.phase * 32)];
  }
}

export class NoiseChannel {
  private readonly sampleRate: number;
  private lfsr = 1;
  private acc = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  sample(period: number, volume: number, shortMode: boolean): number {
    if (period === 0 || volume === 0) return 0;
    this.acc += NES_CPU_HZ / period / this.sampleRate;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.lfsr = stepLfsr(this.lfsr, shortMode);
    }
    return (this.lfsr & 1) === 0 ? volume : 0;
  }
}

export function nesMix(p1: number, p2: number, tri: number, noise: number, dmc = 0): number {
  const pulseSum = p1 + p2;
  const pulseOut = pulseSum === 0 ? 0 : 95.88 / (8128 / pulseSum + 100);
  const tnd = tri / 8227 + noise / 12241 + dmc / 22638;
  const tndOut = tnd === 0 ? 0 : 159.79 / (1 / tnd + 100);
  return pulseOut + tndOut;
}

export class OnePoleHighPass {
  private readonly a: number;
  private prevIn = 0;
  private prevOut = 0;

  constructor(cutoffHz: number, sampleRate: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.a = rc / (rc + 1 / sampleRate);
  }

  process(x: number): number {
    const y = this.a * (this.prevOut + x - this.prevIn);
    this.prevIn = x;
    this.prevOut = y;
    return y;
  }
}

export class OnePoleLowPass {
  private readonly b: number;
  private y = 0;

  constructor(cutoffHz: number, sampleRate: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    this.b = dt / (rc + dt);
  }

  process(x: number): number {
    this.y += this.b * (x - this.y);
    return this.y;
  }
}

// The processor itself only exists inside a real AudioWorklet global scope;
// the guard lets Node (Vitest) import the pure DSP above without crashing.
if (typeof AudioWorkletProcessor !== "undefined") {
  class ApuProcessor extends AudioWorkletProcessor {
    private script: FrameScript | null = null;
    private playing = false;
    private frame = 0;
    private samplesUntilFrame = 0;
    private loop: [number, number] | null = null;
    private framesSinceReport = 0;
    private readonly pulse1 = new PulseChannel(sampleRate);
    private readonly pulse2 = new PulseChannel(sampleRate);
    private readonly tri = new TriangleChannel(sampleRate);
    private readonly noise = new NoiseChannel(sampleRate);
    private readonly hp90 = new OnePoleHighPass(90, sampleRate);
    private readonly hp440 = new OnePoleHighPass(440, sampleRate);
    private readonly lp14k = new OnePoleLowPass(14000, sampleRate);

    constructor() {
      super();
      this.port.onmessage = (e: MessageEvent<ApuMessage>) => this.onMessage(e.data);
    }

    private onMessage(msg: ApuMessage): void {
      switch (msg.type) {
        case "load":
          this.script = msg.script;
          this.frame = 0;
          this.samplesUntilFrame = sampleRate / 60;
          break;
        case "play":
          if (msg.fromFrame !== undefined) this.frame = msg.fromFrame;
          this.samplesUntilFrame = sampleRate / 60;
          this.playing = true;
          break;
        case "pause":
          this.playing = false;
          break;
        case "seek":
          this.frame = msg.frame;
          this.samplesUntilFrame = sampleRate / 60;
          break;
        case "setLoop":
          this.loop = msg.loop;
          break;
        case "hotSwap":
          this.script = msg.script;
          if (this.frame >= msg.script.frameCount) this.frame = 0;
          break;
      }
    }

    private post(report: ApuReport): void {
      this.port.postMessage(report);
    }

    private advanceFrame(): void {
      this.frame++;
      if (this.loop && this.frame >= this.loop[1]) this.frame = this.loop[0];
      if (this.script && this.frame >= this.script.frameCount) {
        this.playing = false;
        this.frame = 0;
        this.post({ type: "ended" });
        return;
      }
      if (++this.framesSinceReport >= 4) {
        this.framesSinceReport = 0;
        this.post({ type: "frame", frame: this.frame });
      }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const out = outputs[0][0];
      if (!this.script || !this.playing) {
        out.fill(0);
        return true;
      }
      const [p1c, p2c, tric, noisec] = this.script.channels;
      for (let i = 0; i < out.length; i++) {
        if (this.samplesUntilFrame <= 0) {
          this.advanceFrame();
          this.samplesUntilFrame += sampleRate / 60;
          if (!this.playing) {
            out.fill(0, i);
            return true;
          }
        }
        this.samplesUntilFrame -= 1;
        const f = this.frame;
        const s1 = this.pulse1.sample(p1c.period[f], p1c.volume[f], p1c.duty[f]);
        const s2 = this.pulse2.sample(p2c.period[f], p2c.volume[f], p2c.duty[f]);
        const st = this.tri.sample(tric.period[f], tric.volume[f] > 0);
        const sn = this.noise.sample(noisec.period[f], noisec.volume[f], noisec.duty[f] === 1);
        const mixed = nesMix(s1, s2, st, sn);
        out[i] = this.lp14k.process(this.hp440.process(this.hp90.process(mixed)));
      }
      return true;
    }
  }

  registerProcessor("apu", ApuProcessor);
}
