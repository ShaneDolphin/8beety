import { autoArrange } from "./auto-arrange";
import type { ChipProfile } from "./chip-profiles";
import type { Song } from "./song";

export type PolyMode = "top" | "bottom" | "arp" | "split";

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
