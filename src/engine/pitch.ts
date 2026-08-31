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
