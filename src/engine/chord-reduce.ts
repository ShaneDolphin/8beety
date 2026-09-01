// §7.3: cap chords at 4 tones for arp. When reducing, drop the 5th first,
// then doubled octaves, keeping root, 3rd, 7th, and extensions.
export function reduceChord(midis: number[]): number[] {
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  if (notes.length <= 4) return notes;
  const root = notes[0];
  const pc = (n: number) => (((n - root) % 12) + 12) % 12;

  // 1. Drop 5ths, highest first (never the root itself).
  while (notes.length > 4) {
    const i = notes.map(pc).lastIndexOf(7);
    if (i <= 0) break;
    notes.splice(i, 1);
  }

  // 2. Drop doubled pitch classes, higher duplicate first.
  while (notes.length > 4) {
    let dropped = false;
    for (let i = notes.length - 1; i > 0; i--) {
      if (notes.some((m, j) => j < i && pc(m) === pc(notes[i]))) {
        notes.splice(i, 1);
        dropped = true;
        break;
      }
    }
    if (!dropped) break;
  }

  // 3. Rare fallback: drop from the top.
  while (notes.length > 4) notes.pop();
  return notes;
}
