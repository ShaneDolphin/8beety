import library from "./chord-library.json";
import { numeralFor, pcForNumeral, scalePcs, type KeyInfo, type Quality } from "./theory";

export type ChordSpec = { rootPc: number; quality: Quality };

// §8.3.2 levels 1–2. Enrichment never edits the source; callers derive tracks.
export function enrichChord(
  rootPc: number,
  quality: Quality,
  level: number,
  key: KeyInfo,
  melodyIntervalOverRoot?: number,
): ChordSpec {
  if (level <= 0) return { rootPc, quality };
  const scale = new Set(scalePcs(key));
  const inScale = (semis: number) => scale.has((rootPc + semis) % 12);
  let q: Quality = quality;

  // Level 1: diatonic sevenths.
  if (q === "maj") q = inScale(11) ? "maj7" : inScale(10) ? "dom7" : "maj";
  else if (q === "min" && inScale(10)) q = "min7";

  if (level >= 2) {
    // Sus when the melody sits on a 2nd or 4th over the chord (§8.3.2).
    if (melodyIntervalOverRoot === 2 && inScale(2)) return { rootPc, quality: "sus2" };
    if (melodyIntervalOverRoot === 5 && inScale(5)) return { rootPc, quality: "sus4" };
    // Diatonic ninths.
    if (inScale(2)) {
      if (q === "maj7") q = "maj9";
      else if (q === "min7") q = "min9";
      else if (q === "maj") q = "add9";
    }
  }
  return { rootPc, quality: q };
}

export type Substitution = { id: string; tags: string[]; chords: ChordSpec[] };

const QUALITY_FROM_LIBRARY = new Set([
  "maj", "min", "maj7", "min7", "dom7", "sus2", "sus4", "add9", "min9", "maj9",
]);

// §8.3.2 level 3: library progressions in the same mode and length whose first
// and last chords match, ranked by overlap with the chosen mood chip.
export function substitutionsFor(
  detected: ChordSpec[],
  key: KeyInfo,
  mood: string,
): Substitution[] {
  if (detected.length < 2) return [];
  const numerals = detected.map((c) => numeralFor(c.rootPc, c.quality, key));
  const first = numerals[0]?.toLowerCase();
  const last = numerals[numerals.length - 1]?.toLowerCase();
  if (!first || !last) return [];

  const scored: { score: number; sub: Substitution }[] = [];
  for (const p of library.progressions) {
    if (p.mode !== key.mode || p.bars !== detected.length) continue;
    if (p.numerals[0].toLowerCase() !== first) continue;
    if (p.numerals[p.numerals.length - 1].toLowerCase() !== last) continue;

    const chords: ChordSpec[] = [];
    let valid = true;
    for (let i = 0; i < p.numerals.length; i++) {
      const pc = pcForNumeral(p.numerals[i], key);
      const quality = p.qualities[i];
      if (pc === null || !QUALITY_FROM_LIBRARY.has(quality)) {
        valid = false;
        break;
      }
      chords.push({ rootPc: pc, quality: quality as Quality });
    }
    if (!valid) continue;
    const identical = chords.every(
      (c, i) => c.rootPc === detected[i].rootPc && c.quality === detected[i].quality,
    );
    if (identical) continue;

    const score = (p.tags.includes(mood) ? 10 : 0) + p.tags.length * 0.1;
    scored.push({ score, sub: { id: p.id, tags: p.tags, chords } });
  }
  scored.sort((a, b) => b.score - a.score || a.sub.id.localeCompare(b.sub.id));
  return scored.slice(0, 3).map((s) => s.sub);
}
