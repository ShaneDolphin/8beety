import { useState } from "react";
import type { ChannelDef } from "../engine/chip-profiles";
import { PROFILES } from "../engine/chip-profiles";
import { PRESETS } from "../engine/instruments";
import { useStore } from "../store";

function RackCard({ def }: { def: ChannelDef }) {
  const project = useStore((s) => s.project);
  const song = useStore((s) => s.song);
  const assignToSlot = useStore((s) => s.assignToSlot);
  const [over, setOver] = useState(false);

  const owner = project?.tracks.find((t) => t.slots.includes(def.id));
  const src = owner && song ? song.tracks[owner.sourceIndex] : undefined;
  const instrumentName = src?.isDrums
    ? "NES Kit"
    : owner
      ? (PRESETS.find((p) => p.id === owner.instrumentId)?.name ?? owner.instrumentId)
      : null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const trackId = e.dataTransfer.getData("text/plain");
        if (trackId) assignToSlot(trackId, def.id);
      }}
      className={`min-w-36 flex-1 rounded border px-3 py-2 transition-colors ${
        over
          ? "border-emerald-500 bg-emerald-950/40"
          : owner
            ? "border-zinc-700 bg-zinc-900"
            : "border-dashed border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{def.label}</div>
      {owner ? (
        <div className="mt-0.5 truncate text-sm">
          <span className="font-medium">“{owner.name}”</span>
          <span className="text-zinc-400"> · {instrumentName}</span>
        </div>
      ) : (
        <div className="mt-0.5 text-sm text-zinc-600">empty — drop a track</div>
      )}
    </div>
  );
}

export default function ChipRack() {
  const project = useStore((s) => s.project);
  if (!project) return null;
  const profile = PROFILES[project.chip === "gb" ? "gb" : "nes"];
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
      {profile.channels.map((c) => (
        <RackCard key={c.id} def={c} />
      ))}
    </div>
  );
}
