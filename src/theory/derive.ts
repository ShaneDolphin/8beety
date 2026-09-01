import { reduceChord } from "../engine/chord-reduce";
import type { Note, SourceTrack } from "../engine/song";
import { QUALITY_INTERVALS, type Quality } from "./theory";
import type { ChordSpec } from "./enrich";

// §8.3.3: voice for the chip — at most 4 tones (same drop rules as arp mode),
// inverted so the top note stays below the melody in that bar.
export function chordMidis(rootPc: number, quality: Quality, below?: number): number[] {
  const rootMidi = 48 + rootPc; // C3..B3 register
  let midis = reduceChord(QUALITY_INTERVALS[quality].map((i) => rootMidi + i));
  if (below !== undefined) {
    for (let guard = 0; guard < 12 && Math.max(...midis) >= below; guard++) {
      const top = Math.max(...midis);
      midis = [...new Set(midis.map((m) => (m === top ? m - 12 : m)))];
    }
  }
  return midis.sort((a, b) => a - b);
}

export function deriveChordTrack(
  chords: ChordSpec[],
  segments: { startTick: number; endTick: number }[],
  index: number,
  name: string,
  melodyLowAt?: (startTick: number) => number | undefined,
): SourceTrack {
  const notes: Note[] = [];
  for (let i = 0; i < Math.min(chords.length, segments.length); i++) {
    const seg = segments[i];
    const below = melodyLowAt?.(seg.startTick);
    for (const midi of chordMidis(chords[i].rootPc, chords[i].quality, below)) {
      notes.push({
        tick: seg.startTick,
        durationTicks: seg.endTick - seg.startTick,
        midi,
        velocity: 90,
      });
    }
  }
  const pitches = notes.map((n) => n.midi);
  return {
    index,
    name,
    midiChannel: 0,
    isDrums: false,
    notes,
    maxPolyphony: Math.max(1, ...segments.map((_, i) => (i < chords.length ? 4 : 0))),
    pitchRange: [Math.min(...pitches, 127), Math.max(...pitches, 0)],
  };
}
