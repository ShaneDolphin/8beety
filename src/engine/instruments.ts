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
  // Chords: the compiler generates the arpeggio from the chord tones (§7.7);
  // this preset only supplies the tone. Speed comes from arpFramesPerStep.
  { id: "arp-chord", name: "Arp Chord", kinds: ["pulse"], volume: sustain(10), duty: sustain(1) },
  {
    id: "pulse-bass",
    name: "Pulse Bass",
    kinds: ["pulse"],
    volume: { values: [12, 11, 10, 8, 6, 5, 4, 4] },
    duty: sustain(0),
    arpeggio: sustain(-12), // one octave down
  },
];

PRESETS.push(
  // Game Boy CH3: duty macro = wave preset index (0 triangle-ish, 1 saw, 2 organ, 3 buzz)
  { id: "wave-bass", name: "Wave Bass", kinds: ["wave"], volume: sustain(15), duty: sustain(0) },
  { id: "organ", name: "Organ", kinds: ["wave"], volume: sustain(15), duty: sustain(2) },
);

// 16-bit chips (Sega YM2612 FM patches, SNES SPC700 sample bank). `duty`
// here selects the patch/sample bank index, not a pulse duty cycle.
const pluckDecay: Macro = { values: [15, 13, 11, 9, 8, 8, 8, 8] };

PRESETS.push(
  { id: "fm-epiano", name: "FM E.Piano", kinds: ["fm"], volume: sustain(12), duty: sustain(0) },
  { id: "fm-bass", name: "FM Bass", kinds: ["fm"], volume: sustain(14), duty: sustain(1) },
  { id: "fm-brass", name: "FM Brass", kinds: ["fm"], volume: sustain(12), duty: sustain(2) },
  { id: "fm-bell", name: "FM Bell", kinds: ["fm"], volume: sustain(12), duty: sustain(3) },
  { id: "fm-lead", name: "FM Lead", kinds: ["fm"], volume: sustain(12), duty: sustain(4) },
  { id: "fm-organ", name: "FM Organ", kinds: ["fm"], volume: sustain(12), duty: sustain(5) },
  { id: "fm-strings", name: "FM Strings", kinds: ["fm"], volume: sustain(12), duty: sustain(6) },
  { id: "fm-pluck", name: "FM Pluck", kinds: ["fm"], volume: pluckDecay, duty: sustain(7) },
);

PRESETS.push(
  { id: "spc-strings", name: "Strings", kinds: ["sample"], volume: sustain(12), duty: sustain(0) },
  { id: "spc-epiano", name: "E.Piano", kinds: ["sample"], volume: sustain(12), duty: sustain(1) },
  { id: "spc-brass", name: "Brass", kinds: ["sample"], volume: sustain(12), duty: sustain(2) },
  { id: "spc-flute", name: "Flute", kinds: ["sample"], volume: sustain(12), duty: sustain(3) },
  { id: "spc-harp", name: "Harp", kinds: ["sample"], volume: sustain(12), duty: sustain(4) },
  { id: "spc-bass", name: "SPC Bass", kinds: ["sample"], volume: sustain(14), duty: sustain(5) },
  { id: "spc-choir", name: "Choir", kinds: ["sample"], volume: sustain(12), duty: sustain(6) },
);

export function getPreset(id: string): Instrument {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown instrument preset: ${id}`);
  return p;
}

export function presetsForKind(kind: ChannelDef["kind"]): Instrument[] {
  return PRESETS.filter((p) => p.kinds.includes(kind));
}

// §5 minimal instrument tweaks: duty, attack/decay (rewrites the volume macro
// from two numbers), vibrato depth and delay. No full macro editor in v1.
export type InstrumentTweaks = {
  duty?: number;
  attack?: number; // frames ramping 0 → preset peak
  decay?: number; // frames falling peak → 0; 0 = sustain at peak
  vibratoDepth?: number; // timer units; 0 removes vibrato
  vibratoDelay?: number; // frames before vibrato starts
};

export function applyTweaks(inst: Instrument, tweaks?: InstrumentTweaks): Instrument {
  if (!tweaks) return inst;
  const out: Instrument = { ...inst };
  if (tweaks.duty !== undefined && inst.kinds.includes("pulse")) {
    out.duty = { values: [tweaks.duty] };
  }
  if (tweaks.attack !== undefined || tweaks.decay !== undefined) {
    const peak = Math.max(...inst.volume.values);
    const attack = tweaks.attack ?? 0;
    const decay = tweaks.decay ?? 0;
    const values: number[] = [];
    for (let i = 0; i < attack; i++) values.push(Math.round(((i + 1) / (attack + 1)) * peak));
    values.push(peak);
    for (let i = 1; i <= decay; i++) values.push(Math.round(peak * (1 - i / decay)));
    out.volume = { values };
  }
  if (tweaks.vibratoDepth !== undefined) {
    if (tweaks.vibratoDepth <= 0) {
      out.pitch = undefined;
    } else {
      const d = tweaks.vibratoDepth;
      const half = Math.round(d / 2);
      const delay = tweaks.vibratoDelay ?? 20;
      out.pitch = {
        values: [...Array<number>(delay).fill(0), 0, half, d, half, 0, -half, -d, -half],
        loop: delay,
      };
    }
  }
  return out;
}
