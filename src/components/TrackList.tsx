import { NES_PROFILE } from "../engine/chip-profiles";
import { presetsForKind } from "../engine/instruments";
import type { TrackArrangement } from "../engine/project";
import type { SourceTrack } from "../engine/song";
import { useStore } from "../store";

const SLOT_OPTIONS = [{ id: "", label: "— unassigned —" }].concat(
  NES_PROFILE.channels.map((c) => ({ id: c.id, label: c.label })),
);

function TrackRow({ arr, src }: { arr: TrackArrangement; src: SourceTrack }) {
  const updateTrack = useStore((s) => s.updateTrack);
  const warnings = useStore((s) => s.warnings).filter((w) => w.trackId === arr.id);

  const slotId = arr.slots[0] ?? "";
  const slotDef = NES_PROFILE.channels.find((c) => c.id === slotId);
  const presets = slotDef ? presetsForKind(slotDef.kind) : [];
  const unassigned = slotId === "";
  const hints = [
    ...(unassigned ? ["Track is unassigned and silent"] : []),
    ...(src.isDrums ? ["Drum rendering arrives in M3"] : []),
    ...warnings.map((w) => w.message),
  ];

  return (
    <div className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-2 text-sm">
      <span className="w-40 truncate font-medium" title={src.name}>
        {src.name}
      </span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
        {src.isDrums ? "drums" : `poly ${src.maxPolyphony}`}
      </span>

      <select
        value={slotId}
        onChange={(e) => updateTrack(arr.id, { slots: e.target.value === "" ? [] : [e.target.value] })}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
      >
        {SLOT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={arr.instrumentId}
        disabled={presets.length === 0}
        onChange={(e) => updateTrack(arr.id, { instrumentId: e.target.value })}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 disabled:opacity-40"
      >
        {presets.length === 0 ? (
          <option value={arr.instrumentId}>—</option>
        ) : (
          presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </select>

      <select
        value={arr.polyMode}
        onChange={(e) => updateTrack(arr.id, { polyMode: e.target.value as TrackArrangement["polyMode"] })}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
      >
        <option value="top">top</option>
        <option value="bottom">bottom</option>
      </select>

      <button
        onClick={() => updateTrack(arr.id, { mute: !arr.mute })}
        className={`w-7 rounded px-2 py-1 font-mono text-xs ${
          arr.mute ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
        title="Mute"
      >
        M
      </button>
      <button
        onClick={() => updateTrack(arr.id, { solo: !arr.solo })}
        className={`w-7 rounded px-2 py-1 font-mono text-xs ${
          arr.solo ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
        title="Solo"
      >
        S
      </button>

      {hints.length > 0 && (
        <span className="text-amber-400" title={hints.join("\n")}>
          ⚠
        </span>
      )}
    </div>
  );
}

export default function TrackList() {
  const song = useStore((s) => s.song);
  const project = useStore((s) => s.project);
  if (!song || !project) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      {project.tracks.map((arr) => {
        const src = song.tracks[arr.sourceIndex];
        return src ? <TrackRow key={arr.id} arr={arr} src={src} /> : null;
      })}
      <p className="px-4 py-3 text-xs text-zinc-600">
        Drop another .mid file anywhere to replace the song.
      </p>
    </div>
  );
}
