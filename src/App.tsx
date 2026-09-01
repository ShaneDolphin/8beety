import { useRef, useState } from "react";
import { ApuPlayer } from "./audio/player";
import { buildM1Fixture } from "./engine/fixtures/m1-fixture";

export default function App() {
  const playerRef = useRef<ApuPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);

  async function toggle() {
    if (!playerRef.current) {
      const player = new ApuPlayer();
      await player.init();
      player.load(buildM1Fixture());
      player.onFrame = setFrame;
      player.onEnded = () => setPlaying(false);
      playerRef.current = player;
    }
    if (playing) {
      playerRef.current.pause();
      setPlaying(false);
    } else {
      await playerRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Chiptune Composer</h1>
      <p className="text-zinc-400 text-sm">M1: NES fixture — C major arp / tri bass / noise hat</p>
      <button
        onClick={() => void toggle()}
        className="rounded bg-emerald-600 px-6 py-2 font-mono hover:bg-emerald-500"
      >
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <p className="font-mono text-xs text-zinc-500">
        frame {frame} / 480 · bar {Math.floor(frame / 120) + 1}
      </p>
    </div>
  );
}
