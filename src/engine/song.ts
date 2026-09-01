export type Note = {
  tick: number;
  durationTicks: number;
  midi: number;
  velocity: number; // 0–127
};

export type SourceTrack = {
  index: number;
  name: string; // from track name meta, else "Track N"
  midiChannel: number; // 0–15; channel 9 is drums under GM
  program?: number; // GM program number if present
  isDrums: boolean; // midiChannel === 9 or name matches /drum|perc/i
  notes: Note[]; // sorted by tick
  maxPolyphony: number; // computed; used to suggest a polyMode
  pitchRange: [number, number];
};

export type Song = {
  name: string;
  ppq: number;
  originalBpm: number; // first tempo event, or 120
  tempoMap: { tick: number; bpm: number }[];
  timeSignature: [number, number];
  durationTicks: number;
  tracks: SourceTrack[];
};
