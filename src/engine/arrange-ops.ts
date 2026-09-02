import { PROFILES, type PlayableChip } from "./chip-profiles";
import type { FrameScript } from "./frame-script";
import { presetsForKind } from "./instruments";
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

// §7.5 (four-chip remap): each chip declares a canonical slot list by role
// [lead, harmony, bass, drums, extra...]. Switching chips maps every slot to
// the same role index in the target chip; a role with no counterpart in the
// target (index past its list) drops to unassigned (silent), same as before.
const ROLE_SLOTS: Record<PlayableChip, string[]> = {
  nes: ["p1", "p2", "tri", "noise"],
  gb: ["p1", "p2", "wave", "noise"],
  sega: ["fm1", "fm2", "fm3", "dac", "fm4", "fm5"],
  snes: ["v1", "v2", "v3", "v7", "v4", "v5", "v6", "v8"],
};

// Slot ids that are shared across chips (p1/p2/noise) land on the same role
// index in every table that contains them, so a single reverse lookup works
// regardless of which chip a track's current slots came from.
const SLOT_ROLE_INDEX: Record<string, number> = {};
for (const slots of Object.values(ROLE_SLOTS)) {
  slots.forEach((id, idx) => {
    SLOT_ROLE_INDEX[id] = idx;
  });
}

const BASS_IDS = new Set(["tri-bass", "pulse-bass", "wave-bass", "fm-bass", "spc-bass"]);
const BASS_BY_CHIP: Record<PlayableChip, string> = {
  nes: "tri-bass",
  gb: "wave-bass",
  sega: "fm-bass",
  snes: "spc-bass",
};

const LEAD_IDS = new Set(["square-lead", "thin-lead", "nasal-lead", "echo-lead", "fm-lead", "spc-epiano"]);
const LEAD_BY_CHIP: Record<PlayableChip, string> = {
  nes: "square-lead",
  gb: "square-lead",
  sega: "fm-lead",
  snes: "spc-epiano",
};

function mapInstrument(
  instrumentId: string,
  chip: PlayableChip,
  targetKind: ReturnType<typeof channelKind>,
): string {
  if (targetKind === null) return instrumentId; // track ends up unassigned: leave it be
  if (BASS_IDS.has(instrumentId)) return BASS_BY_CHIP[chip];
  if (LEAD_IDS.has(instrumentId)) return LEAD_BY_CHIP[chip];
  return presetsForKind(targetKind)[0]?.id ?? instrumentId;
}

function channelKind(chip: PlayableChip, slotId: string) {
  return PROFILES[chip].channels.find((c) => c.id === slotId)?.kind ?? null;
}

// Chip switch keeps the arrangement sensible: every slot maps to the same
// role index in the target chip's slot list (§7.5); the instrument follows
// via a role table (leads and basses map among themselves per target chip),
// falling back to the target kind's first preset for anything else.
export function remapForChip(tracks: TrackArrangement[], chip: PlayableChip): TrackArrangement[] {
  const targetSlots = ROLE_SLOTS[chip];

  return tracks.map((t) => {
    const newSlots = t.slots
      .map((s) => {
        const idx = SLOT_ROLE_INDEX[s];
        return idx !== undefined ? targetSlots[idx] : undefined;
      })
      .filter((s): s is string => s !== undefined);

    const targetKind = newSlots.length > 0 ? channelKind(chip, newSlots[0]) : null;

    return {
      ...t,
      slots: newSlots,
      instrumentId: mapInstrument(t.instrumentId, chip, targetKind),
    };
  });
}

export function loopFrames(script: FrameScript, bars: [number, number]): [number, number] {
  const start = script.barStarts[Math.max(0, bars[0])] ?? 0;
  const end =
    bars[1] >= 0 && bars[1] < script.barStarts.length
      ? script.barStarts[bars[1]]
      : script.frameCount;
  return [start, end];
}
