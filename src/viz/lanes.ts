import type { ChipProfile } from "../engine/chip-profiles";
import type { Project } from "../engine/project";

export type Lane = {
  channelId: string;
  label: string; // VOCALS / GUITAR / BASS / DRUMS (or keyword-matched)
  trackName: string | null; // the owning track, when assigned
  kind: "pitch" | "drums";
};

const CANONICAL = ["VOCALS", "GUITAR", "BASS", "DRUMS"];

function defaultLabel(i: number): string {
  return i < CANONICAL.length ? CANONICAL[i] : `CH ${i + 1}`;
}

function keywordLabel(name: string): string | null {
  if (/vocal|vox|voice|lead|melody|sing/i.test(name)) return "VOCALS";
  if (/guitar|gtr/i.test(name)) return "GUITAR";
  if (/bass/i.test(name)) return "BASS";
  if (/drum|perc|kit|beat/i.test(name)) return "DRUMS";
  return null;
}

// The visible lanes are the chip's channels, one per channel — that's what is
// truthfully playing. Labels default to the canonical four (VOCALS/GUITAR/
// BASS/DRUMS) in channel order, then "CH 5", "CH 6"... for chips with more
// channels (SEGA/SNES); a matching owning-track name wins, and the track
// name itself shows as a sub-label.
export function lanesFor(project: Project, profile: ChipProfile): Lane[] {
  return profile.channels.map((ch, i) => {
    const owner = project.tracks.find((t) => t.slots.includes(ch.id));
    return {
      channelId: ch.id,
      label: (owner && keywordLabel(owner.name)) ?? defaultLabel(i),
      trackName: owner?.name ?? null,
      kind: ch.kind === "noise" || ch.id === "dac" ? "drums" : "pitch",
    };
  });
}
