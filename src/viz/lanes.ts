import type { ChipProfile } from "../engine/chip-profiles";
import type { Project } from "../engine/project";

export type Lane = {
  channelId: string;
  label: string; // VOCALS / GUITAR / BASS / DRUMS (or keyword-matched)
  trackName: string | null; // the owning track, when assigned
  kind: "pitch" | "drums";
};

const CANONICAL = ["VOCALS", "GUITAR", "BASS", "DRUMS"];

function keywordLabel(name: string): string | null {
  if (/vocal|vox|voice|lead|melody|sing/i.test(name)) return "VOCALS";
  if (/guitar|gtr/i.test(name)) return "GUITAR";
  if (/bass/i.test(name)) return "BASS";
  if (/drum|perc|kit|beat/i.test(name)) return "DRUMS";
  return null;
}

// The four visible lanes are the chip's channels — that's what is truthfully
// playing. Labels default to the canonical four in channel order; a matching
// owning-track name wins, and the track name itself shows as a sub-label.
export function lanesFor(project: Project, profile: ChipProfile): Lane[] {
  return profile.channels.map((ch, i) => {
    const owner = project.tracks.find((t) => t.slots.includes(ch.id));
    return {
      channelId: ch.id,
      label: (owner && keywordLabel(owner.name)) ?? CANONICAL[Math.min(i, 3)],
      trackName: owner?.name ?? null,
      kind: ch.kind === "noise" ? "drums" : "pitch",
    };
  });
}
