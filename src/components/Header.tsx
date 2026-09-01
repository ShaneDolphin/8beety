import { useState } from "react";
import { COFFEE_URL } from "../config";
import { useStore } from "../store";
import AboutPanel from "./AboutPanel";
import ExportMenu from "./ExportMenu";
import PixelLogo from "./PixelLogo";

export default function Header() {
  const song = useStore((s) => s.song);
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const frame = useStore((s) => s.frame);
  const script = useStore((s) => s.script);
  const setBpm = useStore((s) => s.setBpm);
  const setChip = useStore((s) => s.setChip);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const stop = useStore((s) => s.stop);

  const [showAbout, setShowAbout] = useState(false);

  if (!song || !project) return null;

  const bar = script ? script.barStarts.filter((b) => b <= frame).length : 1;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
      <PixelLogo className="h-4 w-auto shrink-0" />
      <span className="max-w-48 truncate text-sm text-zinc-400" title={song.name}>
        {song.name}
      </span>
      <select
        value={project.chip === "gb" ? "gb" : "nes"}
        onChange={(e) => setChip(e.target.value as "nes" | "gb")}
        title="Chip"
        className={`rounded border px-2 py-0.5 font-mono text-xs ${
          project.chip === "gb"
            ? "border-lime-800 bg-lime-950 text-lime-300"
            : "border-red-900 bg-zinc-800 text-zinc-200"
        }`}
      >
        <option value="nes">NES</option>
        <option value="gb">GB</option>
      </select>

      <label className="ml-2 flex items-center gap-1 text-sm text-zinc-400">
        BPM
        <input
          type="number"
          min={40}
          max={300}
          value={project.bpm}
          placeholder={String(Math.round(song.originalBpm))}
          onChange={(e) => setBpm(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              setBpm(project.bpm + (e.key === "ArrowUp" ? 10 : -10));
            }
          }}
          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right font-mono text-sm text-zinc-100"
        />
        <button
          title={`Reset to original tempo (${Math.round(song.originalBpm)})`}
          onClick={() => setBpm(song.originalBpm)}
          className="rounded px-1 text-zinc-500 hover:text-zinc-200"
        >
          ↺
        </button>
      </label>

      <div className="flex items-center gap-1">
        <button
          onClick={stop}
          title="Back to start"
          className="rounded bg-zinc-800 px-3 py-1 font-mono hover:bg-zinc-700"
        >
          ⏮
        </button>
        <button
          onClick={() => void (playing ? pause() : play())}
          title="Play/Pause (Space)"
          className="rounded bg-emerald-600 px-4 py-1 font-mono hover:bg-emerald-500"
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <ExportMenu />
        {COFFEE_URL !== "" && (
          <a
            href={COFFEE_URL}
            target="_blank"
            rel="noreferrer"
            title="Buy me a coffee"
            className="text-sm hover:opacity-80"
          >
            ☕
          </a>
        )}
        <button
          onClick={() => setShowAbout(true)}
          title="About"
          className="text-sm text-zinc-500 hover:text-zinc-200"
        >
          ⓘ
        </button>
        <span className="hidden font-mono text-xs text-zinc-500 sm:inline">
          bar {bar} · frame {frame}
        </span>
      </div>
      {showAbout && <AboutPanel onClose={() => setShowAbout(false)} />}
    </header>
  );
}
