// Homegrown music theory core (documented deviation from the spec's `tonal`
// suggestion): the chord vocabulary is exactly the §8.2 voicings, so a
// deterministic pitch-class-set matcher is smaller, testable, and never
// disagrees with the enrichment code that consumes it.
import library from "./chord-library.json";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export type Quality =
  | "maj" | "min" | "maj7" | "min7" | "dom7"
  | "sus2" | "sus4" | "add9" | "min9" | "maj9";

export const QUALITY_INTERVALS = library.voicings as Record<Quality, number[]>;

export const QUALITY_SUFFIX: Record<Quality, string> = {
  maj: "",
  min: "m",
  maj7: "maj7",
  min7: "m7",
  dom7: "7",
  sus2: "sus2",
  sus4: "sus4",
  add9: "add9",
  min9: "m9",
  maj9: "maj9",
};

export type DetectedChord = { rootPc: number; quality: Quality; label: string };
export type KeyInfo = { tonicPc: number; mode: "major" | "minor"; label: string };

const pcSet = (root: number, intervals: number[]) =>
  new Set(intervals.map((i) => (root + i) % 12));

const setsEqual = (a: Set<number>, b: Set<number>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

// Exact-match priority: richer qualities first so {C E G B D} reads maj9,
// not maj7-plus-noise; triads before sus so plain thirds win.
const EXACT_ORDER: Quality[] = [
  "maj9", "min9", "add9", "maj7", "min7", "dom7", "maj", "min", "sus4", "sus2",
];

export function detectChord(midis: number[]): DetectedChord | null {
  if (midis.length === 0) return null;
  const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12));
  const bassPc = ((Math.min(...midis) % 12) + 12) % 12;
  const roots = [bassPc, ...[...pcs].filter((p) => p !== bassPc)];

  for (const root of roots) {
    for (const quality of EXACT_ORDER) {
      if (setsEqual(pcs, pcSet(root, QUALITY_INTERVALS[quality]))) {
        return { rootPc: root, quality, label: NOTE_NAMES[root] + QUALITY_SUFFIX[quality] };
      }
    }
  }

  // Subset match: the chord's tones are all present (extra color tones allowed).
  let best: { root: number; quality: Quality; size: number } | null = null;
  for (const root of roots) {
    for (const quality of EXACT_ORDER) {
      const chord = pcSet(root, QUALITY_INTERVALS[quality]);
      if (chord.size >= 3 && [...chord].every((p) => pcs.has(p))) {
        if (!best || chord.size > best.size) best = { root, quality, size: chord.size };
      }
    }
    if (best) break; // earlier roots (bass first) take priority
  }
  if (best) {
    return {
      rootPc: best.root,
      quality: best.quality,
      label: NOTE_NAMES[best.root] + QUALITY_SUFFIX[best.quality],
    };
  }

  // Fallback: bass is the root; pick the triad flavor from whatever third exists.
  const quality: Quality = pcs.has((bassPc + 3) % 12) ? "min" : "maj";
  return { rootPc: bassPc, quality, label: NOTE_NAMES[bassPc] + QUALITY_SUFFIX[quality] };
}

// Krumhansl-Schmuckler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(hist: number[], profile: number[], rotation: number): number {
  const n = 12;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = hist[(i + rotation) % 12];
    const y = profile[i];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = sxy - (sx * sy) / n;
  const denom = Math.sqrt((sxx - (sx * sx) / n) * (syy - (sy * sy) / n));
  return denom === 0 ? 0 : cov / denom;
}

export function detectKey(notes: { midi: number; durationTicks: number }[]): KeyInfo {
  const hist = new Array<number>(12).fill(0);
  for (const n of notes) hist[((n.midi % 12) + 12) % 12] += Math.max(1, n.durationTicks);
  let best: KeyInfo = { tonicPc: 0, mode: "major", label: "C major" };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      const score = correlate(hist, mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE, tonic);
      if (score > bestScore) {
        bestScore = score;
        best = { tonicPc: tonic, mode, label: `${NOTE_NAMES[tonic]} ${mode}` };
      }
    }
  }
  return best;
}

const MAJOR_DEGREES: Record<number, string> = { 0: "i", 2: "ii", 4: "iii", 5: "iv", 7: "v", 9: "vi", 11: "vii" };
const MINOR_DEGREES: Record<number, string> = { 0: "i", 2: "ii", 3: "iii", 5: "iv", 7: "v", 8: "vi", 10: "vii" };

const isMinorish = (q: Quality) => q === "min" || q === "min7" || q === "min9";

export function scalePcs(key: KeyInfo): number[] {
  const steps = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((s) => (key.tonicPc + s) % 12);
}

export function numeralFor(rootPc: number, quality: Quality, key: KeyInfo): string | null {
  const degree = (((rootPc - key.tonicPc) % 12) + 12) % 12;
  const base = (key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES)[degree];
  if (!base) return null;
  return isMinorish(quality) ? base : base.toUpperCase();
}

export function pcForNumeral(numeral: string, key: KeyInfo): number | null {
  const table = key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
  const target = numeral.toLowerCase();
  for (const [offset, base] of Object.entries(table)) {
    if (base === target) return (key.tonicPc + Number(offset)) % 12;
  }
  return null;
}
