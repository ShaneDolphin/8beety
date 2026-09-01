export type ChannelDef = {
  id: string; // "p1", "p2", "tri", "noise", "dmc", "wave", "saw"
  label: string; // "Pulse 1"
  kind: "pulse" | "triangle" | "noise" | "dpcm" | "wave" | "saw";
  hasVolume: boolean;
  duties?: number[]; // fraction of period, e.g. [0.125, 0.25, 0.5, 0.75]
  midiRange: [number, number];
  acceptsDrums: boolean;
};

export type ChipProfile = {
  id: "nes" | "gb" | "nes-vrc6";
  name: string;
  stereo: boolean;
  channels: ChannelDef[];
};

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

export const PROFILES: Record<"nes" | "gb", ChipProfile> = {
  nes: NES_PROFILE,
  gb: GB_PROFILE,
};
