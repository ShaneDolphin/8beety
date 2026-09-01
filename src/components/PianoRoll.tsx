import { useEffect, useMemo, useRef } from "react";
import type { SourceTrack } from "../engine/song";
import { useStore } from "../store";

const W = 240;
const H = 40;

export default function PianoRoll({ src }: { src: SourceTrack }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useStore((s) => s.frame);
  const script = useStore((s) => s.script);
  const song = useStore((s) => s.song);
  const seek = useStore((s) => s.seek);

  const endTick = useMemo(() => {
    let end = song?.durationTicks ?? 1;
    for (const n of src.notes) end = Math.max(end, n.tick + n.durationTicks);
    return Math.max(1, end);
  }, [song, src]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#101012";
    ctx.fillRect(0, 0, W, H);

    const [lo, hi] = src.pitchRange;
    const span = Math.max(12, hi - lo);
    ctx.fillStyle = src.isDrums ? "#8b8b93" : "#34d399";
    for (const n of src.notes) {
      const x = (n.tick / endTick) * W;
      const w = Math.max(1, (n.durationTicks / endTick) * W);
      const y = H - 4 - ((n.midi - lo) / span) * (H - 8);
      ctx.fillRect(x, y, w, 2);
    }

    if (script && script.frameCount > 0) {
      const x = (frame / script.frameCount) * W;
      ctx.fillStyle = "#f87171";
      ctx.fillRect(x, 0, 1, H);
    }
  }, [src, endTick, frame, script]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      title="Click to seek"
      onClick={(e) => {
        if (!script) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        seek(frac * script.frameCount);
      }}
      className="h-10 w-60 shrink-0 cursor-pointer rounded border border-zinc-800"
    />
  );
}
