import type { FrameScript } from "./frame-script";
import type { TrackArrangement } from "./project";

// §7.4: dropping a track onto an occupied slot swaps them. The dropped track
// takes exactly [slotId]; the previous owner keeps its other slots and
// inherits the dropped track's former slots.
export function assignTrackToSlot(
  tracks: TrackArrangement[],
  trackId: string,
  slotId: string,
): TrackArrangement[] {
  const dropped = tracks.find((t) => t.id === trackId);
  if (!dropped) return tracks;
  const owner = tracks.find((t) => t.id !== trackId && t.slots.includes(slotId));
  const freed = dropped.slots.filter((s) => s !== slotId);

  return tracks.map((t) => {
    if (t.id === trackId) return { ...t, slots: [slotId] };
    if (owner && t.id === owner.id) {
      const kept = t.slots.filter((s) => s !== slotId);
      const inherited = freed.filter((s) => !kept.includes(s));
      return { ...t, slots: [...kept, ...inherited] };
    }
    return t;
  });
}

const TO_GB: Record<string, string> = { "tri-bass": "wave-bass", "tri-pluck": "wave-bass" };
const TO_NES: Record<string, string> = { "wave-bass": "tri-bass", organ: "tri-bass" };

// Chip switch keeps the arrangement sensible: tri↔wave slots and their
// instruments swap; everything else carries over untouched.
export function remapForChip(
  tracks: TrackArrangement[],
  chip: "nes" | "gb",
): TrackArrangement[] {
  const slotFrom = chip === "gb" ? "tri" : "wave";
  const slotTo = chip === "gb" ? "wave" : "tri";
  const instMap = chip === "gb" ? TO_GB : TO_NES;
  return tracks.map((t) => ({
    ...t,
    slots: t.slots.map((s) => (s === slotFrom ? slotTo : s)),
    instrumentId: instMap[t.instrumentId] ?? t.instrumentId,
  }));
}

export function loopFrames(script: FrameScript, bars: [number, number]): [number, number] {
  const start = script.barStarts[Math.max(0, bars[0])] ?? 0;
  const end =
    bars[1] >= 0 && bars[1] < script.barStarts.length
      ? script.barStarts[bars[1]]
      : script.frameCount;
  return [start, end];
}
