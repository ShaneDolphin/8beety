export const NES_CPU_HZ = 1789773;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

// 11-bit pulse timer. Timer values below 8 silence the channel on real
// hardware (authentic; preserved), above 2047 the pitch is out of range.
export function nesPulseTimer(freq: number): number | null {
  const t = Math.round(NES_CPU_HZ / (16 * freq) - 1);
  if (t < 8 || t > 2047) return null;
  return t;
}

export function nesPulseFreq(timer: number): number {
  return NES_CPU_HZ / (16 * (timer + 1));
}

export function nesTriangleTimer(freq: number): number | null {
  const t = Math.round(NES_CPU_HZ / (32 * freq) - 1);
  if (t < 0 || t > 2047) return null;
  return t;
}

export function nesTriangleFreq(timer: number): number {
  return NES_CPU_HZ / (32 * (timer + 1));
}

// Game Boy 11-bit period registers: higher x = higher pitch.
export function gbPulsePeriod(freq: number): number | null {
  const x = Math.round(2048 - 131072 / freq);
  if (x < 0 || x > 2047) return null;
  return x;
}

export function gbPulseFreq(x: number): number {
  return 131072 / (2048 - x);
}

export function gbWavePeriod(freq: number): number | null {
  const x = Math.round(2048 - 65536 / freq);
  if (x < 0 || x > 2047) return null;
  return x;
}

export function gbWaveFreq(x: number): number {
  return 65536 / (2048 - x);
}

// ---- YM2612 (Sega Genesis) ----
// freq = fnum * 2^(block-1) * YM_FNUM_HZ. Pack (block<<11)|fnum into the
// 16-bit period array; the fnum quantization is the chip's real detune.
export const YM_FNUM_HZ = 7670453 / (144 * 2 ** 20);

export function ymPack(freq: number): number | null {
  for (let block = 0; block < 8; block++) {
    const fnum = Math.round(freq / (YM_FNUM_HZ * 2 ** (block - 1)));
    if (fnum >= 1 && fnum <= 2047) return (block << 11) | fnum;
  }
  return null;
}

export function ymFreq(packed: number): number {
  const block = packed >> 11;
  const fnum = packed & 0x7ff;
  return fnum * 2 ** (block - 1) * YM_FNUM_HZ;
}

// ---- SPC700 (SNES) ----
// 14-bit pitch register; 0x1000 = 1.0x. Samples are authored at C4.
export const SPC_BASE_HZ = 261.6256;

export function spcPitch(freq: number): number | null {
  const p = Math.round((freq / SPC_BASE_HZ) * 0x1000);
  if (p < 1 || p > 0x3fff) return null;
  return p;
}

export function spcFreq(pitch: number): number {
  return (pitch / 0x1000) * SPC_BASE_HZ;
}
