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

// ---- Game Boy DMG ----

// GB LFSR: feedback = bit0 XOR bit1 into bit 14; 7-bit width mode mirrors the
// feedback into bit 6 as well (the metallic mode). Seed 0x7fff.
export function stepGbLfsr(reg: number, width7: boolean): number {
  const x = (reg ^ (reg >> 1)) & 1;
  let next = (reg >> 1) | (x << 14);
  if (width7) next = (next & ~(1 << 6)) | (x << 6);
  return next;
}

const wavegen = (fn: (i: number) => number): number[] =>
  Array.from({ length: 32 }, (_, i) => Math.max(0, Math.min(15, Math.round(fn(i)))));

// CH3 preset waves (§4.2): triangle-ish bass, saw-ish, organ, buzz.
export const WAVE_PRESETS: number[][] = [
  wavegen((i) => (i < 16 ? i : 31 - i)),
  wavegen((i) => i / 2),
  wavegen((i) => 7.5 + 5 * Math.sin((2 * Math.PI * i) / 32) + 2.5 * Math.sin((4 * Math.PI * i) / 32)),
  wavegen((i) => ([15, 15, 15, 0, 15, 0, 0, 0] as const)[i % 8]),
];

// §4.2: hardware envelope steps are quantized to 64 Hz. Macro-driven volume
// increases are register writes (immediate); decreases wait for the next tick.
export class GbVolumeLatch {
  private readonly perTick: number;
  private count = 0;
  private vol = 0;

  constructor(sampleRate: number) {
    this.perTick = sampleRate / 64;
  }

  next(requested: number): number {
    if (requested > this.vol) {
      this.vol = requested;
      this.count = 0;
    } else if (requested < this.vol) {
      this.count++;
      if (this.count >= this.perTick) {
        this.count = 0;
        this.vol = requested;
      }
    } else {
      this.count = 0;
    }
    return this.vol;
  }
}

export class GbPulseChannel {
  private readonly sampleRate: number;
  private readonly latch: GbVolumeLatch;
  private phase = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.latch = new GbVolumeLatch(sampleRate);
  }

  sample(period: number, volume: number, dutyIndex: number): number {
    if (period === 0) return 0;
    const vol = this.latch.next(volume);
    if (vol === 0) return 0;
    const freq = 131072 / (2048 - period);
    this.phase = (this.phase + freq / this.sampleRate) % 1;
    return this.phase < PULSE_DUTIES[dutyIndex] ? vol : 0;
  }
}

export class GbWaveChannel {
  private readonly sampleRate: number;
  private phase = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  // duty carries the wave preset index; volume quantizes to 100/50/25/off.
  sample(period: number, volume: number, waveIndex: number): number {
    if (period === 0 || volume === 0) return 0;
    const freq = 65536 / (2048 - period);
    this.phase = (this.phase + (freq * 32) / this.sampleRate) % 32;
    const raw = WAVE_PRESETS[waveIndex & 3][Math.floor(this.phase)];
    const scale = volume >= 12 ? 1 : volume >= 6 ? 0.5 : 0.25;
    return raw * scale;
  }
}

export class GbNoiseChannel {
  private readonly sampleRate: number;
  private readonly latch: GbVolumeLatch;
  private lfsr = 0x7fff;
  private acc = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.latch = new GbVolumeLatch(sampleRate);
  }

  // Pragmatic v1: clocked like the NES table (rate = 1789773/period) so the
  // chip-agnostic drum presets carry over; the GB divisor table can come later.
  sample(period: number, volume: number, width7: boolean): number {
    if (period === 0) return 0;
    const vol = this.latch.next(volume);
    if (vol === 0) return 0;
    this.acc += NES_CPU_HZ / period / this.sampleRate;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.lfsr = stepGbLfsr(this.lfsr, width7);
    }
    return (this.lfsr & 1) === 0 ? vol : 0;
  }
}

// The full chip engine, shared verbatim by the realtime processor and the
// offline WAV renderer (and instantiable under Node for parity tests). It
// must not touch worklet globals; the sample rate always comes in here.
export class ApuCore {
  playing = false;
  frame = 0;
  onFrameAdvance?: (frame: number) => void;
  onEnded?: () => void;

  private readonly sampleRate: number;
  private script: FrameScript | null = null;
  private chip: "nes" | "gb" | "nes-vrc6" | "sega" | "snes" = "nes";
  private samplesUntilFrame = 0;
  private loop: [number, number] | null = null;
  private readonly pulse1: PulseChannel;
  private readonly pulse2: PulseChannel;
  private readonly tri: TriangleChannel;
  private readonly noise: NoiseChannel;
  private readonly hp90: OnePoleHighPass;
  private readonly hp440: OnePoleHighPass;
  private readonly lp14k: OnePoleLowPass;
  private readonly gbP1: GbPulseChannel;
  private readonly gbP2: GbPulseChannel;
  private readonly gbWave: GbWaveChannel;
  private readonly gbNoise: GbNoiseChannel;
  private readonly gbHpL: OnePoleHighPass;
  private readonly gbHpR: OnePoleHighPass;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.pulse1 = new PulseChannel(sampleRate);
    this.pulse2 = new PulseChannel(sampleRate);
    this.tri = new TriangleChannel(sampleRate);
    this.noise = new NoiseChannel(sampleRate);
    this.hp90 = new OnePoleHighPass(90, sampleRate);
    this.hp440 = new OnePoleHighPass(440, sampleRate);
    this.lp14k = new OnePoleLowPass(14000, sampleRate);
    this.gbP1 = new GbPulseChannel(sampleRate);
    this.gbP2 = new GbPulseChannel(sampleRate);
    this.gbWave = new GbWaveChannel(sampleRate);
    this.gbNoise = new GbNoiseChannel(sampleRate);
    this.gbHpL = new OnePoleHighPass(90, sampleRate);
    this.gbHpR = new OnePoleHighPass(90, sampleRate);
  }

  load(script: FrameScript): void {
    this.script = script;
    this.chip = script.chip;
    this.frame = 0;
    this.samplesUntilFrame = this.sampleRate / 60;
  }

  play(fromFrame?: number): void {
    if (fromFrame !== undefined) this.frame = fromFrame;
    this.samplesUntilFrame = this.sampleRate / 60;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  seek(frame: number): void {
    this.frame = frame;
    this.samplesUntilFrame = this.sampleRate / 60;
  }

  setLoop(loop: [number, number] | null): void {
    this.loop = loop;
  }

  hotSwap(script: FrameScript): void {
    this.script = script;
    this.chip = script.chip;
    if (this.frame >= script.frameCount) this.frame = 0;
  }

  private advanceFrame(): void {
    this.frame++;
    if (this.loop && this.frame >= this.loop[1]) this.frame = this.loop[0];
    if (this.script && this.frame >= this.script.frameCount) {
      this.playing = false;
      this.frame = 0;
      this.onEnded?.();
      return;
    }
    this.onFrameAdvance?.(this.frame);
  }

  // Renders into outL (and outR when given), continuing from internal state.
  render(outL: Float32Array, outR: Float32Array | null): void {
    if (!this.script || !this.playing) {
      outL.fill(0);
      outR?.fill(0);
      return;
    }
    const [ch0, ch1, ch2, ch3] = this.script.channels;
    for (let i = 0; i < outL.length; i++) {
      if (this.samplesUntilFrame <= 0) {
        this.advanceFrame();
        this.samplesUntilFrame += this.sampleRate / 60;
        if (!this.playing) {
          outL.fill(0, i);
          outR?.fill(0, i);
          return;
        }
      }
      this.samplesUntilFrame -= 1;
      const f = this.frame;
      if (this.chip === "gb") {
        const s1 = this.gbP1.sample(ch0.period[f], ch0.volume[f], ch0.duty[f]);
        const s2 = this.gbP2.sample(ch1.period[f], ch1.volume[f], ch1.duty[f]);
        const sw = this.gbWave.sample(ch2.period[f], ch2.volume[f], ch2.duty[f]);
        const sn = this.gbNoise.sample(ch3.period[f], ch3.volume[f], ch3.duty[f] === 1);
        const samples = [s1, s2, sw, sn];
        const chans = [ch0, ch1, ch2, ch3];
        let l = 0;
        let r = 0;
        for (let c = 0; c < 4; c++) {
          const pan = chans[c].pan[f];
          if (pan & 1) l += samples[c];
          if (pan & 2) r += samples[c];
        }
        outL[i] = this.gbHpL.process((l / 60) * 0.9);
        if (outR) outR[i] = this.gbHpR.process((r / 60) * 0.9);
      } else {
        const s1 = this.pulse1.sample(ch0.period[f], ch0.volume[f], ch0.duty[f]);
        const s2 = this.pulse2.sample(ch1.period[f], ch1.volume[f], ch1.duty[f]);
        const st = this.tri.sample(ch2.period[f], ch2.volume[f] > 0);
        const sn = this.noise.sample(ch3.period[f], ch3.volume[f], ch3.duty[f] === 1);
        const mixed = nesMix(s1, s2, st, sn);
        const v = this.lp14k.process(this.hp440.process(this.hp90.process(mixed)));
        outL[i] = v;
        if (outR) outR[i] = v;
      }
    }
  }
}

// The processor itself only exists inside a real AudioWorklet global scope;
// the guard lets Node (Vitest) import the pure DSP above without crashing.
if (typeof AudioWorkletProcessor !== "undefined") {
  class ApuProcessor extends AudioWorkletProcessor {
    private readonly core = new ApuCore(sampleRate);
    private framesSinceReport = 0;

    constructor() {
      super();
      this.core.onFrameAdvance = (frame) => {
        if (++this.framesSinceReport >= 4) {
          this.framesSinceReport = 0;
          this.post({ type: "frame", frame });
        }
      };
      this.core.onEnded = () => this.post({ type: "ended" });
      this.port.onmessage = (e: MessageEvent<ApuMessage>) => this.onMessage(e.data);
    }

    private post(report: ApuReport): void {
      this.port.postMessage(report);
    }

    private onMessage(msg: ApuMessage): void {
      switch (msg.type) {
        case "load":
          this.core.load(msg.script);
          this.post({ type: "loaded" }); // offline render awaits this ack
          break;
        case "play":
          this.core.play(msg.fromFrame);
          break;
        case "pause":
          this.core.pause();
          break;
        case "seek":
          this.core.seek(msg.frame);
          break;
        case "setLoop":
          this.core.setLoop(msg.loop);
          break;
        case "hotSwap":
          this.core.hotSwap(msg.script);
          break;
      }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const outL = outputs[0][0];
      const outR = outputs[0][1] && outputs[0][1] !== outL ? outputs[0][1] : null;
      this.core.render(outL, outR);
      return true;
    }
  }

  registerProcessor("apu", ApuProcessor);
}
