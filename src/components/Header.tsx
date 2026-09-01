import { useStore } from "../store";

export default function Header() {
  const song = useStore((s) => s.song);
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const frame = useStore((s) => s.frame);
  const script = useStore((s) => s.script);
  const setBpm = useStore((s) => s.setBpm);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const stop = useStore((s) => s.stop);

  if (!song || !project) return null;

  const bar = script ? script.barStarts.filter((b) => b <= frame).length : 1;

  return (
    <header className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
      <span className="font-bold tracking-tight">Chiptune Composer</span>
      <span className="max-w-48 truncate text-sm text-zinc-400" title={song.name}>
        {song.name}
      </span>
      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">NES</span>

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

      <span className="ml-auto font-mono text-xs text-zinc-500">
        bar {bar} · frame {frame}
      </span>
    </header>
  );
}
