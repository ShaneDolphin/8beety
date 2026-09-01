import type { ChannelDef } from "./chip-profiles";

export type Macro = { values: number[]; loop?: number }; // loop = index to jump back to; undefined = hold last

export type Instrument = {
  id: string;
  name: string;
  kinds: ChannelDef["kind"][]; // which channel kinds this instrument is valid on
  volume: Macro; // 0–15, applied per frame from note-on
  arpeggio?: Macro; // semitone offsets relative to the note
  pitch?: Macro; // fine pitch offsets in timer units (vibrato, drum pitch drops)
  duty?: Macro; // index into the channel's duties array
  wave?: number[]; // 32 × 4-bit, Game Boy CH3 only
  noiseMode?: "long" | "short";
  release?: Macro; // volume table played on note-off; if absent, cut immediately
};

export function macroValue(m: Macro, frame: number): number {
  if (frame < m.values.length) return m.values[frame];
  if (m.loop !== undefined && m.loop < m.values.length) {
    const span = m.values.length - m.loop;
    return m.values[m.loop + ((frame - m.loop) % span)];
  }
  return m.values[m.values.length - 1];
}

const sustain = (v: number): Macro => ({ values: [v] });
// Gentle triangle-ish vibrato in timer units, starting after `delay` frames.
const vibratoAfter = (delay: number): Macro => ({
  values: [...Array<number>(delay).fill(0), 0, 1, 2, 1, 0, -1, -2, -1],
  loop: delay,
});

export const PRESETS: Instrument[] = [
  // Leads (pulse)
  {
    id: "square-lead",
    name: "Square Lead",
    kinds: ["pulse"],
    volume: sustain(12),
    duty: sustain(2),
    pitch: vibratoAfter(20),
  },
  { id: "thin-lead", name: "Thin Lead", kinds: ["pulse"], volume: sustain(12), duty: sustain(1) },
  { id: "nasal-lead", name: "Nasal Lead", kinds: ["pulse"], volume: sustain(12), duty: sustain(0) },
  {
    id: "pluck",
    name: "Pluck",
    kinds: ["pulse"],
    volume: { values: [15, 11, 8, 6, 4, 3, 2, 1, 0] },
    duty: sustain(1),
  },
  {
    id: "brass",
    name: "Brass",
    kinds: ["pulse"],
    volume: { values: [8, 10, 12, 13, 14, 14, 15] },
    duty: { values: [0, 0, 1, 1, 2, 2, 2] },
  },
  {
    id: "echo-lead",
    name: "Echo Lead",
    kinds: ["pulse"],
    volume: sustain(12),
    duty: sustain(2),
    pitch: vibratoAfter(20),
  },
  // Bass
  { id: "tri-bass", name: "Tri Bass", kinds: ["triangle"], volume: sustain(15) },
  {
    id: "tri-pluck",
    name: "Tri Pluck",
    kinds: ["triangle"],
    // The triangle has no volume, so "pluck" means a short gate: 8 frames on, then off.
    volume: { values: [15, 15, 15, 15, 15, 15, 15, 15, 0] },
  },
  {
    id: "pulse-bass",
    name: "Pulse Bass",
    kinds: ["pulse"],
    volume: { values: [12, 11, 10, 8, 6, 5, 4, 4] },
    duty: sustain(0),
    arpeggio: sustain(-12), // one octave down
  },
];

export function getPreset(id: string): Instrument {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown instrument preset: ${id}`);
  return p;
}

export function presetsForKind(kind: ChannelDef["kind"]): Instrument[] {
  return PRESETS.filter((p) => p.kinds.includes(kind));
}
