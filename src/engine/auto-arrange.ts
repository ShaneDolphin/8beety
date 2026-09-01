import type { Song, SourceTrack } from "./song";
import type { TrackArrangement } from "./project";

function meanPitch(t: SourceTrack): number {
  return t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
}

function baseArrangement(t: SourceTrack): TrackArrangement {
  return {
    id: `track-${t.index}`,
    sourceIndex: t.index,
    name: t.name,
    slots: [],
    instrumentId: "square-lead",
    polyMode: t.maxPolyphony > 2 ? "bottom" : "top",
    arpFramesPerStep: 1,
    octaveShift: 0,
    transpose: 0,
    volume: 15,
    mute: false,
    solo: false,
  };
}

// SPEC §10.1 heuristic, minus the arp-chord step (arp polyMode lands in M3):
// highest mean pitch + low polyphony → Pulse 1 / Square Lead; next melodic →
// Pulse 2 / Thin Lead; lowest mean pitch non-drum → Triangle / Tri Bass
// (bottom). Drums and everything else stay unassigned.
export function autoArrange(song: Song): { tracks: TrackArrangement[]; assignedCount: number } {
  const arrangements = song.tracks.map(baseArrangement);
  const byIndex = new Map(arrangements.map((a) => [a.sourceIndex, a]));
  const melodic = song.tracks.filter((t) => !t.isDrums);
  const taken = new Set<number>();

  const lowPoly = melodic.filter((t) => t.maxPolyphony <= 2);
  const leadPool = lowPoly.length > 0 ? lowPoly : melodic;
  const lead = [...leadPool].sort((a, b) => meanPitch(b) - meanPitch(a))[0];
  if (lead) {
    const a = byIndex.get(lead.index)!;
    a.slots = ["p1"];
    a.instrumentId = "square-lead";
    a.polyMode = "top";
    taken.add(lead.index);
  }

  const bassPool = melodic.filter((t) => !taken.has(t.index));
  const bass = [...bassPool].sort((a, b) => meanPitch(a) - meanPitch(b))[0];
  if (bass) {
    const a = byIndex.get(bass.index)!;
    a.slots = ["tri"];
    a.instrumentId = "tri-bass";
    a.polyMode = "bottom";
    taken.add(bass.index);
  }

  const secondPool = melodic.filter((t) => !taken.has(t.index));
  const second = [...secondPool].sort((a, b) => meanPitch(b) - meanPitch(a))[0];
  if (second) {
    const a = byIndex.get(second.index)!;
    a.slots = ["p2"];
    a.instrumentId = "thin-lead";
    a.polyMode = "top";
    taken.add(second.index);
  }

  return { tracks: arrangements, assignedCount: taken.size };
}
