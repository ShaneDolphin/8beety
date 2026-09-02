export type ChannelDef = {
  id: string; // "p1", "p2", "tri", "noise", "dmc", "wave", "saw"
  label: string; // "Pulse 1"
  kind: "pulse" | "triangle" | "noise" | "dpcm" | "wave" | "saw" | "fm" | "sample";
  hasVolume: boolean;
  duties?: number[]; // fraction of period, e.g. [0.125, 0.25, 0.5, 0.75]
  midiRange: [number, number];
  acceptsDrums: boolean;
};

export type ChipProfile = {
  id: "nes" | "gb" | "nes-vrc6" | "sega" | "snes";
  name: string;
  stereo: boolean;
  channels: ChannelDef[];
};

export type PlayableChip = "nes" | "gb" | "sega" | "snes";

const PULSE_DUTIES = [0.125, 0.25, 0.5, 0.75];

export const GB_PROFILE: ChipProfile = {
  id: "gb",
  name: "Game Boy DMG",
  stereo: true,
  channels: [
    { id: "p1", label: "Pulse 1", kind: "pulse", hasVolume: true, duties: PULSE_DUTIES, midiRange: [36, 119], acceptsDrums: false },
    { id: "p2", label: "Pulse 2", kind: "pulse", hasVolume: true, duties: PULSE_DUTIES, midiRange: [36, 119], acceptsDrums: false },
    { id: "wave", label: "Wave", kind: "wave", hasVolume: true, midiRange: [24, 107], acceptsDrums: true },
    { id: "noise", label: "Noise", kind: "noise", hasVolume: true, midiRange: [0, 127], acceptsDrums: true },
  ],
};

export const NES_PROFILE: ChipProfile = {
  id: "nes",
  name: "NES 2A03",
  stereo: false,
  channels: [
    {
      id: "p1",
      label: "Pulse 1",
      kind: "pulse",
      hasVolume: true,
      duties: PULSE_DUTIES,
      midiRange: [33, 115],
      acceptsDrums: false,
    },
    {
      id: "p2",
      label: "Pulse 2",
      kind: "pulse",
      hasVolume: true,
      duties: PULSE_DUTIES,
      midiRange: [33, 115],
      acceptsDrums: false,
    },
    {
      id: "tri",
      label: "Triangle",
      kind: "triangle",
      hasVolume: false,
      midiRange: [21, 108],
      acceptsDrums: true,
    },
    {
      id: "noise",
      label: "Noise",
      kind: "noise",
      hasVolume: true,
      midiRange: [0, 127],
      acceptsDrums: true,
    },
  ],
};

const fmLane = (n: number): ChannelDef => ({
  id: `fm${n}`, label: `FM ${n}`, kind: "fm", hasVolume: true,
  midiRange: [24, 108], acceptsDrums: false,
});

export const SEGA_PROFILE: ChipProfile = {
  id: "sega",
  name: "Sega Genesis YM2612",
  stereo: true,
  channels: [
    fmLane(1), fmLane(2), fmLane(3), fmLane(4), fmLane(5),
    { id: "dac", label: "DAC Drums", kind: "sample", hasVolume: true, midiRange: [0, 127], acceptsDrums: true },
  ],
};

// spcPitch caps at the 14-bit pitch register (0x3fff), which tops out at B5
// (MIDI 83); notes above that fold down an octave via the compiler's normal
// range-fold machinery (renderStream in compile.ts) instead of vanishing.
const spcVoice = (n: number): ChannelDef => ({
  id: `v${n}`, label: `Voice ${n}`, kind: "sample", hasVolume: true,
  midiRange: [24, 83], acceptsDrums: true,
});

export const SNES_PROFILE: ChipProfile = {
  id: "snes",
  name: "Super Nintendo SPC700",
  stereo: true,
  channels: [1, 2, 3, 4, 5, 6, 7, 8].map(spcVoice),
};

export const PROFILES: Record<PlayableChip, ChipProfile> = {
  nes: NES_PROFILE, gb: GB_PROFILE, sega: SEGA_PROFILE, snes: SNES_PROFILE,
};

export function profileFor(chip: ChipProfile["id"]): ChipProfile {
  return chip === "nes-vrc6" ? NES_PROFILE : PROFILES[chip];
}
