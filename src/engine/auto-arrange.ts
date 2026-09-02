import { presetsForKind } from "./instruments";
import type { Song, SourceTrack } from "./song";
import type { TrackArrangement } from "./project";

// Falls back to the literal id if a kind ever ends up with no presets, so
// this never hands out an instrument the compiler can't resolve.
const defaultInstrumentFor = (kind: "pulse" | "triangle", fallback: string): string =>
  presetsForKind(kind)[0]?.id ?? fallback;

function meanPitch(t: SourceTrack): number {
  return t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
}

function baseArrangement(t: SourceTrack): TrackArrangement {
  return {
    id: `track-${t.index}`,
    sourceIndex: t.index,
    name: t.name,
    slots: [],
    instrumentId: defaultInstrumentFor("pulse", "square-lead"),
    polyMode: t.maxPolyphony > 2 ? "bottom" : "top",
    arpFramesPerStep: 1,
    octaveShift: 0,
    transpose: 0,
    volume: 15,
    mute: false,
    solo: false,
  };
}

// SPEC §10.1: lead → Pulse 1 / Square Lead; next melodic → Pulse 2 / Thin
// Lead; lowest non-drum → Triangle / Tri Bass (bottom); a drum track →
// Noise; most polyphonic remaining → Pulse 2 with Arp Chord if still free.
// Special case: a lone polyphonic track is spread across tri/p1/p2 (split).
export function autoArrange(song: Song): { tracks: TrackArrangement[]; assignedCount: number } {
  const arrangements = song.tracks.map(baseArrangement);
  const byIndex = new Map(arrangements.map((a) => [a.sourceIndex, a]));
  const melodic = song.tracks.filter((t) => !t.isDrums);
  const taken = new Set<number>();

  const drums = song.tracks.find((t) => t.isDrums);
  if (drums) {
    const a = byIndex.get(drums.index)!;
    a.slots = ["noise"];
    taken.add(drums.index);
  }

  if (melodic.length === 1 && melodic[0].maxPolyphony >= 3) {
    // Piano-only: lowest note → triangle bass, next → p1, overflow arps on p2.
    const a = byIndex.get(melodic[0].index)!;
    a.slots = ["tri", "p1", "p2"];
    a.polyMode = "split";
    a.instrumentId = "arp-chord";
    taken.add(melodic[0].index);
    return { tracks: arrangements, assignedCount: taken.size };
  }

  const lowPoly = melodic.filter((t) => t.maxPolyphony <= 2);
  const leadPool = lowPoly.length > 0 ? lowPoly : melodic;
  const lead = [...leadPool].sort((a, b) => meanPitch(b) - meanPitch(a))[0];
  if (lead) {
    const a = byIndex.get(lead.index)!;
    a.slots = ["p1"];
    a.instrumentId = defaultInstrumentFor("pulse", "square-lead");
    a.polyMode = "top";
    taken.add(lead.index);
  }

  const bassPool = melodic.filter((t) => !taken.has(t.index));
  const bass = [...bassPool].sort((a, b) => meanPitch(a) - meanPitch(b))[0];
  if (bass) {
    const a = byIndex.get(bass.index)!;
    a.slots = ["tri"];
    a.instrumentId = defaultInstrumentFor("triangle", "tri-bass");
    a.polyMode = "bottom";
    taken.add(bass.index);
  }

  const secondPool = melodic.filter((t) => !taken.has(t.index) && t.maxPolyphony <= 2);
  const second = [...secondPool].sort((a, b) => meanPitch(b) - meanPitch(a))[0];
  if (second) {
    const a = byIndex.get(second.index)!;
    a.slots = ["p2"];
    a.instrumentId = "thin-lead";
    a.polyMode = "top";
    taken.add(second.index);
  }

  if (!second) {
    const chordPool = melodic.filter((t) => !taken.has(t.index) && t.maxPolyphony >= 2);
    const chords = [...chordPool].sort((a, b) => b.maxPolyphony - a.maxPolyphony)[0];
    if (chords) {
      const a = byIndex.get(chords.index)!;
      a.slots = ["p2"];
      a.instrumentId = "arp-chord";
      a.polyMode = "arp";
      taken.add(chords.index);
    }
  }

  return { tracks: arrangements, assignedCount: taken.size };
}
