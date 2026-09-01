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
