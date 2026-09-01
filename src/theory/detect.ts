import type { Song, SourceTrack } from "../engine/song";
import { detectChord, type DetectedChord } from "./theory";

export type ChordSegment = {
  startTick: number;
  endTick: number;
  chord: DetectedChord;
  midis: number[];
};

function soundingIn(track: SourceTrack, startTick: number, endTick: number): number[] {
  const midis: number[] = [];
  for (const n of track.notes) {
    if (n.tick < endTick && n.tick + n.durationTicks > startTick) midis.push(n.midi);
  }
  return midis;
}

const pcKey = (midis: number[]) =>
  [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b).join(",");

// §8.3.1: segment by bar, or half-bar when the chord changes mid-bar.
export function segmentTrack(song: Song, track: SourceTrack): ChordSegment[] {
  const barTicks = song.timeSignature[0] * (4 / song.timeSignature[1]) * song.ppq;
  let end = song.durationTicks;
  for (const n of track.notes) end = Math.max(end, n.tick + n.durationTicks);

  const segments: ChordSegment[] = [];
  const push = (startTick: number, endTick: number) => {
    const midis = soundingIn(track, startTick, endTick);
    if (midis.length === 0) return;
    const chord = detectChord(midis);
    if (chord) segments.push({ startTick, endTick, chord, midis });
  };

  for (let bar = 0; bar * barTicks < end; bar++) {
    const start = bar * barTicks;
    const half = start + barTicks / 2;
    const stop = start + barTicks;
    const a = soundingIn(track, start, half);
    const b = soundingIn(track, half, stop);
    if (a.length > 0 && b.length > 0 && pcKey(a) !== pcKey(b)) {
      push(start, half);
      push(half, stop);
    } else {
      push(start, stop);
    }
  }
  return segments;
}
