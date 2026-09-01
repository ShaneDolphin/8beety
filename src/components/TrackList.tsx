import { PROFILES } from "../engine/chip-profiles";
import { presetsForKind } from "../engine/instruments";
import type { LayerMode, TrackArrangement } from "../engine/project";
import type { SourceTrack } from "../engine/song";
import { useStore } from "../store";
import PianoRoll from "./PianoRoll";

const CHIP_LABELS: Record<string, string> = {
  p1: "P1",
  p2: "P2",
  tri: "TRI",
  wave: "WAV",
  noise: "NOI",
};

const LAYER_OPTIONS: { value: LayerMode; label: string }[] = [
  { value: "double", label: "Double" },
  { value: "detune", label: "Detune" },
  { value: "echo3", label: "Echo 3f" },
  { value: "echo6", label: "Echo 6f" },
  { value: "echo9", label: "Echo 9f" },
  { value: "octave-up", label: "Octave ↑" },
  { value: "octave-down", label: "Octave ↓" },
];

function TrackRow({ arr, src, index }: { arr: TrackArrangement; src: SourceTrack; index: number }) {
  const updateTrack = useStore((s) => s.updateTrack);
  const setFocused = useStore((s) => s.setFocused);
  const focused = useStore((s) => s.focusedIndex) === index;
  const warnings = useStore((s) => s.warnings).filter((w) => w.trackId === arr.id);
  const chip = useStore((s) => s.project?.chip) === "gb" ? "gb" : "nes";
  const profile = PROFILES[chip];

  const firstSlotDef = profile.channels.find((c) => c.id === arr.slots[0]);
  const presets = firstSlotDef ? presetsForKind(firstSlotDef.kind) : [];
  const pulseSlots = arr.slots.filter((id) => id === "p1" || id === "p2");
  const layerable =
    arr.slots.length === 2 &&
    pulseSlots.length === 2 &&
    (arr.polyMode === "top" || arr.polyMode === "bottom");
  const showArpSpeed = arr.polyMode === "arp" || arr.polyMode === "split";

  const hints = [
    ...(arr.slots.length === 0 ? ["Track is unassigned and silent"] : []),
    ...(!src.isDrums && src.maxPolyphony > 2 && arr.polyMode === "top"
      ? ["Polyphonic track in top mode — try arp"]
      : []),
    ...warnings.map((w) => w.message),
  ];

  function toggleSlot(id: string) {
    const slots = arr.slots.includes(id) ? arr.slots.filter((s) => s !== id) : [...arr.slots, id];
    updateTrack(arr.id, { slots });
  }

  return (
    <div
      className={`flex items-center gap-3 border-b border-zinc-800/60 px-4 py-2 text-sm ${
        focused ? "bg-zinc-900 ring-1 ring-inset ring-emerald-600" : ""
      }`}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", arr.id);
          e.dataTransfer.effectAllowed = "move";
          setFocused(index);
        }}
        onClick={() => setFocused(index)}
        title="Drag onto a rack card to assign"
        className="cursor-grab text-zinc-600 hover:text-zinc-300 active:cursor-grabbing"
      >
        ⠿
      </span>
      <span
        className="w-32 cursor-default truncate font-medium"
        title={src.name}
        onClick={() => setFocused(index)}
      >
        {src.name}
      </span>
      <PianoRoll src={src} />
      <span className="w-14 rounded bg-zinc-800 px-1.5 py-0.5 text-center font-mono text-[10px] text-zinc-400">
        {src.isDrums ? "drums" : `poly ${src.maxPolyphony}`}
      </span>

      <div className="flex gap-1">
        {profile.channels.map((c) => {
          const on = arr.slots.includes(c.id);
          const order = arr.slots.indexOf(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggleSlot(c.id)}
              title={`${c.label}${on && arr.slots.length > 1 ? ` (slot ${order + 1})` : ""}`}
              className={`rounded px-2 py-1 font-mono text-xs ${
                on ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
            >
              {CHIP_LABELS[c.id]}
            </button>
          );
        })}
      </div>

      {src.isDrums ? (
        <span className="w-36 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-400">
          NES Kit
        </span>
      ) : (
        <>
          <select
            value={arr.instrumentId}
            disabled={presets.length === 0}
            onChange={(e) => updateTrack(arr.id, { instrumentId: e.target.value })}
            className="w-32 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 disabled:opacity-40"
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
            onChange={(e) =>
              updateTrack(arr.id, { polyMode: e.target.value as TrackArrangement["polyMode"] })
            }
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
          >
            <option value="top">top</option>
            <option value="bottom">bottom</option>
            <option value="arp">arp</option>
            <option value="split">split</option>
          </select>

          {showArpSpeed && (
            <select
              value={arr.arpFramesPerStep}
              title="Arp speed (frames per step)"
              onChange={(e) =>
                updateTrack(arr.id, {
                  arpFramesPerStep: Number(e.target.value) as TrackArrangement["arpFramesPerStep"],
                })
              }
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              <option value={1}>1f</option>
              <option value={2}>2f</option>
              <option value={3}>3f</option>
            </select>
          )}

          {layerable && (
            <select
              value={arr.layerMode ?? "double"}
              title="Layer mode for the second pulse"
              onChange={(e) => updateTrack(arr.id, { layerMode: e.target.value as LayerMode })}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              {LAYER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {chip === "gb" && arr.slots.length > 0 && (
        <select
          value={arr.pan ?? 3}
          title="Stereo pan (hard L / both / hard R)"
          onChange={(e) =>
            updateTrack(arr.id, { pan: Number(e.target.value) as TrackArrangement["pan"] })
          }
          className="rounded border border-zinc-700 bg-zinc-950 px-1 py-1 font-mono text-xs"
        >
          <option value={1}>L</option>
          <option value={3}>LR</option>
          <option value={2}>R</option>
        </select>
      )}

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
      {project.tracks.map((arr, index) => {
        const src = song.tracks[arr.sourceIndex];
        return src ? <TrackRow key={arr.id} arr={arr} src={src} index={index} /> : null;
      })}
      <p className="px-4 py-3 text-xs text-zinc-600">
        Drag a track’s ⠿ handle onto a rack card (or click the slot chips). Click a thumbnail to
        seek; drag on the bar ruler to loop. Keys: Space play · Home start · L loop · M/S on the
        focused track · 1–9 focus.
      </p>
    </div>
  );
}
