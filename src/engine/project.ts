import { autoArrange } from "./auto-arrange";
import type { ChipProfile } from "./chip-profiles";
import type { InstrumentTweaks } from "./instruments";
import type { Song } from "./song";

export type PolyMode = "top" | "bottom" | "arp" | "split";

// §7.6: how the second pulse slot doubles the first (two pulse slots, top/bottom).
export type LayerMode = "double" | "detune" | "echo3" | "echo6" | "echo9" | "octave-up" | "octave-down";

export type Region = {
  startBar: number;
  endBar: number; // exclusive
  instrumentId?: string;
  slots?: string[];
  polyMode?: PolyMode;
};

export type TrackArrangement = {
  id: string;
  sourceIndex: number; // -> Song.tracks[sourceIndex]
  name: string;
  slots: string[]; // channel ids; [] = unassigned (silent)
  instrumentId: string;
  polyMode: PolyMode;
  arpFramesPerStep: 1 | 2 | 3;
  octaveShift: number; // -3..+3
  transpose: number; // semitones
  volume: number; // 0–15 scale factor applied to the macro
  mute: boolean;
  solo: boolean;
  layerMode?: LayerMode; // applies when two pulse slots + top/bottom (§7.6)
  pan?: 0 | 1 | 2 | 3; // gb only: 1 = L, 2 = R, 3 = both (default)
  tweaks?: InstrumentTweaks; // §5 minimal tweaks over the preset
  regions?: Region[]; // optional per-section overrides (M7)
};

export type Project = {
  version: 1;
  chip: ChipProfile["id"];
  bpm: number; // global override; the tempo map is flattened to this
  tempoMode: "flatten" | "scale";
  transpose: number; // global semitones
  outputFilter: boolean;
  tracks: TrackArrangement[];
};

export function defaultProject(song: Song): Project {
  return {
    version: 1,
    chip: "nes",
    bpm: Math.round(song.originalBpm),
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks: autoArrange(song).tracks,
  };
}
