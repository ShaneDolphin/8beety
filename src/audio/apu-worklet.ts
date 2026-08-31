// NES 2A03 DSP. This module is loaded both as an AudioWorklet module (via
// ?worker&url) and by Vitest under Node, so it must have no runtime imports
// and must not touch worklet globals at the top level.

// 15-bit LFSR: feedback = bit0 XOR (bit6 in short mode, else bit1),
// shift right, feedback into bit 14.
export function stepLfsr(reg: number, shortMode: boolean): number {
  const tap = shortMode ? (reg >> 6) & 1 : (reg >> 1) & 1;
  const feedback = (reg & 1) ^ tap;
  return (reg >> 1) | (feedback << 14);
}
