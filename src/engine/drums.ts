import type { Macro } from "./instruments";

// Noise-channel drum kit. Periods are raw NES noise timer values (bigger =
// lower pitch); volume macros are FamiTracker-style per-frame tables.
export type DrumPreset = {
  id: string;
  name: string;
  volume: Macro; // must end at 0, no loop
  period: Macro; // noise period per frame; holds last value
  mode: "long" | "short";
  priority: number; // simultaneous hits: highest wins (louder and rarer wins)
};

const preset = (
  id: string,
  name: string,
  volume: number[],
  period: number[],
  priority: number,
  mode: "long" | "short" = "long",
): DrumPreset => ({ id, name, volume: { values: volume }, period: { values: period }, mode, priority });

const crashDecay = Array.from({ length: 30 }, (_, i) => Math.max(0, 15 - Math.round(i * 0.52) - (i >= 29 ? 15 : 0)));
crashDecay[29] = 0;

export const DRUM_PRESETS: DrumPreset[] = [
  preset("kick", "Kick", [15, 10, 4, 0], [380, 508, 762, 1016], 60),
  preset("snare", "Snare", [15, 13, 10, 7, 5, 3, 2, 1, 0], [160], 50),
  preset("crash", "Crash", crashDecay, [64], 40),
  preset("tom-low", "Tom (low)", [15, 10, 5, 2, 0], [508, 508, 762], 35),
  preset("tom-mid", "Tom (mid)", [15, 10, 5, 2, 0], [254, 254, 380], 35),
  preset("tom-high", "Tom (high)", [15, 10, 5, 2, 0], [160, 160, 254], 35),
  preset("open-hat", "Open Hat", [10, 8, 7, 6, 5, 4, 3, 2, 1, 0], [16], 30),
  preset("metal-hit", "Metal Hit", [12, 8, 5, 3, 1, 0], [96], 25, "short"),
  preset("ride", "Ride", [8, 7, 6, 5, 4, 3, 2, 1, 0], [16], 15),
  preset("closed-hat", "Closed Hat", [8, 4, 1, 0], [16], 10),
];

const byId = new Map(DRUM_PRESETS.map((p) => [p.id, p]));

const GM_MAP: Record<number, string> = {
  35: "kick",
  36: "kick",
  37: "metal-hit",
  38: "snare",
  40: "snare",
  41: "tom-low",
  43: "tom-low",
  45: "tom-mid",
  47: "tom-mid",
  48: "tom-high",
  50: "tom-high",
  42: "closed-hat",
  44: "closed-hat",
  46: "open-hat",
  49: "crash",
  52: "crash",
  55: "crash",
  57: "crash",
  51: "ride",
  53: "ride",
  59: "ride",
};

export function gmDrumPreset(gmNote: number): DrumPreset {
  const preset = byId.get(GM_MAP[gmNote] ?? "closed-hat");
  if (!preset) throw new Error("drum kit misconfigured");
  return preset;
}
