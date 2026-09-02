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
  private readonly fm: FmChannel[];
  private readonly echo: EchoBus;
  private readonly lp8kL: OnePoleLowPass;
  private readonly lp8kR: OnePoleLowPass;
  private bank: BankSample[] | null = null;
  private voices: SampleVoice[] = [];
  private dacVoice: SampleVoice | null = null;

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
    this.fm = Array.from({ length: 5 }, () => new FmChannel(sampleRate));
    this.echo = new EchoBus(sampleRate);
    this.lp8kL = new OnePoleLowPass(8000, sampleRate);
    this.lp8kR = new OnePoleLowPass(8000, sampleRate);
  }

  // sega/snes both play through the sample bank (sega's DAC lane, snes's 8
  // voices); it's a few hundred KB of Float32Arrays we don't want to build
  // for nes/gb-only sessions, so it's constructed on first use.
  private ensureBank(chip: FrameScript["chip"]): void {
    if ((chip === "sega" || chip === "snes") && this.bank === null) {
      const bank = buildSampleBank();
      this.bank = bank;
      this.voices = Array.from({ length: 8 }, () => new SampleVoice(this.sampleRate, bank));
      this.dacVoice = new SampleVoice(this.sampleRate, bank);
    }
  }

  load(script: FrameScript): void {
    this.script = script;
    this.chip = script.chip;
    this.frame = 0;
    this.samplesUntilFrame = this.sampleRate / 60;
    this.ensureBank(script.chip);
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
    this.ensureBank(script.chip);
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
      } else if (this.chip === "sega") {
        let l = 0;
        let r = 0;
        for (let c = 0; c < 6; c++) {
          const ch = this.script.channels[c];
          if (!ch) continue;
          const trig = (ch.trig?.[f] ?? 0) === 1 && this.samplesUntilFrame >= this.sampleRate / 60 - 1;
          const s = c < 5
            ? this.fm[c].sample(ch.period[f], ch.volume[f], ch.duty[f], trig)
            : (this.dacVoice as SampleVoice).sample(ch.period[f] || 0x1000, ch.volume[f], ch.duty[f], trig, true);
          const pan = ch.pan[f];
          if (pan & 1) l += s;
          if (pan & 2) r += s;
        }
        outL[i] = this.lp8kL.process((l / 90) * 0.9);
        if (outR) outR[i] = this.lp8kR.process((r / 90) * 0.9);
      } else if (this.chip === "snes") {
        let l = 0;
        let r = 0;
        for (let c = 0; c < 8; c++) {
          const ch = this.script.channels[c];
          if (!ch) continue;
          const trig = (ch.trig?.[f] ?? 0) === 1 && this.samplesUntilFrame >= this.sampleRate / 60 - 1;
          const s = this.voices[c].sample(ch.period[f] || 0x1000, ch.volume[f], ch.duty[f], trig, false);
          const pan = ch.pan[f];
          if (pan & 1) l += s;
          if (pan & 2) r += s;
        }
        const [el, er] = this.echo.process(l / 120, r / 120);
        outL[i] = el * 0.9;
        if (outR) outR[i] = er * 0.9;
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

// ---- Sega Genesis YM2612 ----
// 4-operator FM, style model: sine operators, per-op multiple/detune/level and
// a linear-segment ADSR, op-1 feedback, the chip's 8 algorithm topologies.
// ar/dr/rr are seconds-to-traverse, converted to per-sample deltas.

export type FmOpPatch = {
  mult: number; // frequency multiple (0.5, 1..15)
  detune: number; // +/- cents
  tl: number; // output level 0..1
  ar: number; // attack time (s) 0 -> 1
  dr: number; // decay time (s) 1 -> sl
  sl: number; // sustain level 0..1
  rr: number; // release time (s) level -> 0
};

export type FmPatch = {
  name: string;
  algorithm: number; // 0..7, YM2612 topologies
  feedback: number; // 0..7, op1 self-modulation
  ops: [FmOpPatch, FmOpPatch, FmOpPatch, FmOpPatch];
};

const op = (mult: number, detune: number, tl: number, ar: number, dr: number, sl: number, rr: number): FmOpPatch =>
  ({ mult, detune, tl, ar, dr, sl, rr });

export const FM_PATCHES: FmPatch[] = [
  { name: "FM E.Piano", algorithm: 4, feedback: 3, ops: [op(1, 0, 0.35, 0.004, 0.9, 0.0, 0.15), op(14, 0, 0.18, 0.002, 0.25, 0.0, 0.1), op(1, 3, 0.35, 0.004, 1.4, 0.1, 0.2), op(1, -3, 0.4, 0.002, 0.6, 0.0, 0.15)] },
  { name: "FM Bass", algorithm: 3, feedback: 5, ops: [op(0.5, 0, 0.5, 0.004, 0.3, 0.3, 0.08), op(1, 0, 0.45, 0.004, 0.25, 0.1, 0.08), op(1, 0, 0.35, 0.004, 0.2, 0.0, 0.08), op(0.5, 0, 0.95, 0.004, 0.5, 0.45, 0.1)] },
  { name: "FM Brass", algorithm: 4, feedback: 6, ops: [op(1, 2, 0.55, 0.05, 0.8, 0.55, 0.12), op(1, -2, 0.5, 0.07, 0.8, 0.5, 0.12), op(1, 5, 0.85, 0.06, 1.0, 0.7, 0.15), op(1, -5, 0.85, 0.08, 1.0, 0.7, 0.15)] },
  { name: "FM Bell", algorithm: 5, feedback: 2, ops: [op(1, 0, 0.5, 0.002, 2.5, 0.0, 0.6), op(3.5, 4, 0.4, 0.002, 1.2, 0.0, 0.4), op(1, 0, 0.7, 0.002, 2.0, 0.0, 0.6), op(7, -4, 0.3, 0.002, 0.8, 0.0, 0.3)] },
  { name: "FM Lead", algorithm: 4, feedback: 7, ops: [op(1, 4, 0.6, 0.01, 0.5, 0.65, 0.1), op(2, 0, 0.45, 0.01, 0.6, 0.4, 0.1), op(1, -4, 0.9, 0.01, 0.7, 0.75, 0.12), op(2, 7, 0.5, 0.01, 0.5, 0.45, 0.1)] },
  { name: "FM Organ", algorithm: 7, feedback: 0, ops: [op(1, 0, 0.8, 0.005, 0.1, 0.8, 0.06), op(2, 2, 0.55, 0.005, 0.1, 0.55, 0.06), op(3, -2, 0.35, 0.005, 0.1, 0.35, 0.06), op(4, 0, 0.25, 0.005, 0.1, 0.25, 0.06)] },
  { name: "FM Strings", algorithm: 2, feedback: 4, ops: [op(1, 6, 0.4, 0.25, 1.2, 0.6, 0.35), op(2, 0, 0.3, 0.2, 1.0, 0.4, 0.3), op(1, -6, 0.85, 0.3, 1.5, 0.75, 0.4), op(1, 10, 0.35, 0.2, 1.0, 0.5, 0.3)] },
  { name: "FM Pluck", algorithm: 4, feedback: 5, ops: [op(1, 0, 0.7, 0.002, 0.35, 0.0, 0.1), op(3, 3, 0.5, 0.002, 0.15, 0.0, 0.08), op(1, 0, 0.9, 0.002, 0.5, 0.0, 0.12), op(2, -3, 0.45, 0.002, 0.2, 0.0, 0.08)] },
];

class FmOperator {
  phase = 0;
  env = 0;
  private stage: 0 | 1 | 2 | 3 = 3; // attack/decay/sustain/release
  keyOn(): void { this.stage = 0; this.env = 0; this.phase = 0; }
  keyOff(): void { if (this.stage !== 3) this.stage = 3; }
  // dt = 1/sampleRate; returns sin(2π·phase + mod·modIndex) · env · tl
  tick(p: FmOpPatch, freq: number, mod: number, dt: number): number {
    const f = freq * p.mult * 2 ** (p.detune / 1200);
    this.phase = (this.phase + f * dt) % 1;
    if (this.stage === 0) {
      this.env += dt / Math.max(1e-4, p.ar);
      if (this.env >= 1) { this.env = 1; this.stage = 1; }
    } else if (this.stage === 1) {
      this.env -= dt * ((1 - p.sl) / Math.max(1e-4, p.dr));
      if (this.env <= p.sl) { this.env = p.sl; this.stage = 2; }
    } else if (this.stage === 3) {
      this.env -= dt / Math.max(1e-4, p.rr);
      if (this.env < 0) this.env = 0;
    }
    return Math.sin(2 * Math.PI * this.phase + mod) * this.env * p.tl;
  }
}

// YM2612 algorithms as (carrier mask, modulation edges m->c). Op order 0..3
// is the chip's slot order 1,3,2,4 simplified to a linear 0..3 chain layout.
const FM_ALGS: { carriers: number[]; routes: [number, number][] }[] = [
  { carriers: [3], routes: [[0, 1], [1, 2], [2, 3]] },
  { carriers: [3], routes: [[0, 2], [1, 2], [2, 3]] },
  { carriers: [3], routes: [[0, 3], [1, 2], [2, 3]] },
  { carriers: [3], routes: [[0, 1], [1, 3], [2, 3]] },
  { carriers: [1, 3], routes: [[0, 1], [2, 3]] },
  { carriers: [1, 2, 3], routes: [[0, 1], [0, 2], [0, 3]] },
  { carriers: [1, 2, 3], routes: [[0, 1]] },
  { carriers: [0, 1, 2, 3], routes: [] },
];

const ENV_SILENT = 1e-3; // envelope level below which a release is inaudible

export class FmChannel {
  private readonly dt: number;
  private readonly ops = [new FmOperator(), new FmOperator(), new FmOperator(), new FmOperator()];
  private fb1 = 0; // op0 previous output for feedback
  private held = false;
  private everKeyedOn = false; // guards against sounding before the first key-on
  private lastFreqPacked = 0; // remembered so release can keep sounding once period drops to 0

  constructor(sampleRate: number) {
    this.dt = 1 / sampleRate;
  }

  sample(packedFreq: number, volume: number, patchIndex: number, trig: boolean): number {
    const patch = FM_PATCHES[patchIndex & 7];
    if (trig && volume > 0) {
      for (const o of this.ops) o.keyOn();
      this.held = true;
      this.everKeyedOn = true;
    }
    if (volume === 0 && this.held) {
      for (const o of this.ops) o.keyOff();
      this.held = false;
    }
    if (packedFreq !== 0) this.lastFreqPacked = packedFreq;
    if (!this.everKeyedOn) return 0;
    // The compiler leaves period at 0 once a note is off (no sustained
    // register to read); keep synthesizing at the last sounded frequency
    // until every operator's release envelope has actually decayed, so the
    // release stage (and the release-gain-15 quirk below) is audible.
    if (packedFreq === 0 && this.ops.every((o) => o.env < ENV_SILENT)) return 0;
    const freqSource = packedFreq !== 0 ? packedFreq : this.lastFreqPacked;
    if (freqSource === 0) return 0;
    const freq = (freqSource & 0x7ff) * 2 ** ((freqSource >> 11) - 1) * (7670453 / (144 * 2 ** 20));
    const alg = FM_ALGS[patch.algorithm & 7];
    const outs = [0, 0, 0, 0];
    let mix = 0;
    for (let i = 0; i < 4; i++) {
      let mod = 0;
      for (const [m, c] of alg.routes) if (c === i) mod += outs[m] * Math.PI * 2;
      if (i === 0 && patch.feedback > 0) mod += this.fb1 * Math.PI * (patch.feedback / 7);
      outs[i] = this.ops[i].tick(patch.ops[i], freq, mod, this.dt);
      if (i === 0) this.fb1 = outs[0];
      if (alg.carriers.includes(i)) mix += outs[i];
    }
    const gain = this.held || volume > 0 ? volume : 15; // release rides last volume; scale by 15 during release
    return (mix / alg.carriers.length) * gain;
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

// ---- SPC700 / sample playback ----
// The bank is synthesized deterministically at 32000 Hz (the SPC's rate) with
// 8-bit quantization for BRR-flavored grit. Melodic samples are authored at
// C4 and loop; drums are one-shots. No assets, no Math.random.

export type BankSample = { data: Float32Array; loopStart: number | null };

export const SAMPLE_INDEX = {
  strings: 0, epiano: 1, brass: 2, flute: 3, harp: 4, bass: 5, choir: 6,
  kick: 7, snare: 8, hatClosed: 9, hatOpen: 10, crash: 11, tom: 12,
} as const;

const BANK_RATE = 32000;
const C4 = 261.6256;

const quantize8 = (x: number): number => Math.round(Math.max(-1, Math.min(1, x)) * 127) / 127;

// Deterministic noise: tiny LCG, fixed seed.
function makeNoise(len: number, seed: number): Float32Array {
  let s = seed >>> 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
}

function additive(partials: [number, number][], len: number, loopStart: number | null, decay = 0): BankSample {
  const data = new Float32Array(len);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    let v = 0;
    const t = i / BANK_RATE;
    for (const [harm, amp] of partials) v += amp * Math.sin(2 * Math.PI * C4 * harm * t);
    v *= decay > 0 ? Math.exp(-t / decay) : 1;
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < len; i++) data[i] = quantize8((data[i] / peak) * 0.9);
  return { data, loopStart };
}

function drum(len: number, seed: number, tone: number, noiseAmt: number, startHz: number, endHz: number, decay: number): BankSample {
  const noise = makeNoise(len, seed);
  const data = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / BANK_RATE;
    const hz = startHz + (endHz - startHz) * (i / len);
    phase += hz / BANK_RATE;
    const env = Math.exp(-t / decay);
    data[i] = quantize8((tone * Math.sin(2 * Math.PI * phase) + noiseAmt * noise[i]) * env * 0.9);
  }
  return { data, loopStart: null };
}

export function buildSampleBank(): BankSample[] {
  const loopLen = Math.round((BANK_RATE / C4) * 8) * 4; // whole periods so loops click-free
  return [
    additive([[1, 0.6], [2, 0.5], [3, 0.35], [4, 0.2], [5, 0.12], [1.007, 0.4], [2.014, 0.25]], loopLen * 2, loopLen),      // strings
    additive([[1, 1.0], [2, 0.15], [4, 0.3], [7, 0.12], [10, 0.05]], BANK_RATE, null, 0.6),                                    // epiano (one-shot)
    additive([[1, 0.9], [2, 0.6], [3, 0.5], [4, 0.35], [5, 0.25], [6, 0.15]], loopLen * 2, loopLen),                          // brass
    additive([[1, 1.0], [2, 0.08], [3, 0.03]], loopLen * 2, loopLen),                                                          // flute
    additive([[1, 1.0], [2, 0.4], [3, 0.2], [5, 0.1]], BANK_RATE / 2, null, 0.25),                                             // harp (one-shot)
    additive([[0.5, 1.0], [1, 0.6], [1.5, 0.2], [2, 0.3]], loopLen * 2, loopLen),                                              // bass
    additive([[1, 0.7], [1.01, 0.5], [0.99, 0.5], [2, 0.2], [3, 0.15]], loopLen * 2, loopLen),                                 // choir
    drum(BANK_RATE / 4, 1, 1.0, 0.25, 120, 40, 0.06),   // kick
    drum(BANK_RATE / 4, 2, 0.3, 1.0, 220, 180, 0.05),   // snare
    drum(BANK_RATE / 16, 3, 0.0, 1.0, 0, 0, 0.012),     // hatClosed
    drum(BANK_RATE / 4, 4, 0.0, 1.0, 0, 0, 0.07),       // hatOpen
    drum(BANK_RATE, 5, 0.05, 1.0, 0, 0, 0.3),           // crash
    drum(BANK_RATE / 4, 6, 1.0, 0.3, 180, 90, 0.08),    // tom
  ];
}

export class SampleVoice {
  private readonly step: number; // bank-rate samples per output sample at pitch 0x1000
  private readonly bank: BankSample[];
  private pos = -1; // -1 = not playing
  private index = 0;
  private g0 = 0; private g1 = 0; // gaussian-ish history
  private holdCounter = 0; private holdValue = 0;

  constructor(sampleRate: number, bank: BankSample[]) {
    this.step = BANK_RATE / sampleRate;
    this.bank = bank;
  }

  sample(pitch: number, volume: number, sampleIndex: number, trig: boolean, dacMode: boolean): number {
    if (trig && volume > 0) { this.pos = 0; this.index = sampleIndex; }
    if (this.pos < 0) return 0;
    const s = this.bank[this.index];
    if (!s) return 0;
    this.pos += this.step * (pitch / 0x1000);
    if (this.pos >= s.data.length) {
      if (s.loopStart === null) { this.pos = -1; return 0; }
      this.pos = s.loopStart + ((this.pos - s.loopStart) % (s.data.length - s.loopStart));
    }
    let v = s.data[Math.floor(this.pos)];
    if (dacMode) {
      // 8-bit @ ~11kHz sample-and-hold: the Genesis DAC drum grit.
      if (this.holdCounter <= 0) { this.holdValue = quantize8(v); this.holdCounter = (BANK_RATE / 11025) / (this.step * (pitch / 0x1000)); }
      this.holdCounter -= 1;
      v = this.holdValue;
    } else {
      // SNES gaussian-flavored 3-tap smoothing.
      const y = 0.25 * this.g0 + 0.5 * this.g1 + 0.25 * v;
      this.g0 = this.g1; this.g1 = v; v = y;
    }
    return v * volume;
  }
}

export class EchoBus {
  private readonly buf: Float32Array[];
  private readonly len: number;
  private readonly sampleRate: number;
  private idx = 0;
  private lpL = 0; private lpR = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.len = Math.round(sampleRate * 0.096);
    this.buf = [new Float32Array(this.len), new Float32Array(this.len)];
  }

  process(l: number, r: number): [number, number] {
    const dl = this.buf[0][this.idx];
    const dr = this.buf[1][this.idx];
    const b = 1 - Math.exp((-2 * Math.PI * 5000) / this.sampleRate); // one-pole coeff at bus sample rate
    this.lpL += b * (dl - this.lpL);
    this.lpR += b * (dr - this.lpR);
    this.buf[0][this.idx] = l + this.lpL * 0.4;
    this.buf[1][this.idx] = r + this.lpR * 0.4;
    this.idx = (this.idx + 1) % this.len;
    return [l + this.lpL * 0.25, r + this.lpR * 0.25];
  }
}
