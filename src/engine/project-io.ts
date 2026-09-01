import { z } from "zod";
import type { Project } from "./project";

// Validated container for saved projects and share links. The source MIDI is
// embedded as base64 so one file/link restores everything.
const regionSchema = z.object({
  startBar: z.number().int(),
  endBar: z.number().int(),
  instrumentId: z.string().optional(),
  slots: z.array(z.string()).optional(),
  polyMode: z.enum(["top", "bottom", "arp", "split"]).optional(),
});

const trackSchema = z.object({
  id: z.string(),
  sourceIndex: z.number().int().min(0),
  name: z.string(),
  slots: z.array(z.string()),
  instrumentId: z.string(),
  polyMode: z.enum(["top", "bottom", "arp", "split"]),
  arpFramesPerStep: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  octaveShift: z.number().int().min(-3).max(3),
  transpose: z.number().int().min(-48).max(48),
  volume: z.number().int().min(0).max(15),
  mute: z.boolean(),
  solo: z.boolean(),
  layerMode: z
    .enum(["double", "detune", "echo3", "echo6", "echo9", "octave-up", "octave-down"])
    .optional(),
  pan: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  regions: z.array(regionSchema).optional(),
});

const projectSchema = z.object({
  version: z.literal(1),
  chip: z.enum(["nes", "gb", "nes-vrc6"]),
  bpm: z.number().min(40).max(300),
  tempoMode: z.enum(["flatten", "scale"]),
  transpose: z.number().int(),
  outputFilter: z.boolean(),
  tracks: z.array(trackSchema),
});

const fileSchema = z.object({
  app: z.literal("chiptune-composer"),
  version: z.literal(1),
  project: projectSchema,
  midi: z.string().optional(),
  midiName: z.string().optional(),
});

export type ProjectFile = z.infer<typeof fileSchema>;
export type DecodedProjectFile = {
  project: Project;
  midiBytes: Uint8Array | null;
  midiName: string | null;
};

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeProjectFile(
  project: Project,
  midiBytes: Uint8Array | null,
  midiName: string | null,
): ProjectFile {
  return {
    app: "chiptune-composer",
    version: 1,
    project,
    ...(midiBytes ? { midi: toBase64(midiBytes) } : {}),
    ...(midiName ? { midiName } : {}),
  };
}

export function decodeProjectFile(raw: unknown): DecodedProjectFile | null {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { project, midi, midiName } = parsed.data;
  try {
    return {
      project,
      midiBytes: midi !== undefined ? fromBase64(midi) : null,
      midiName: midiName ?? null,
    };
  } catch {
    return null; // corrupt base64
  }
}
