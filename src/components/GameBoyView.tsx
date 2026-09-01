import { useEffect, useMemo, useRef } from "react";
import { PROFILES } from "../engine/chip-profiles";
import { drawGbFrame } from "../viz/gb-render";
import { lanesFor } from "../viz/lanes";
import { useStore } from "../store";

// Live DAW-style playthrough on a DMG-green canvas. The worklet reports the
// playhead every 4 frames; an rAF clock interpolates between reports so the
// strip scrolls smoothly.
export default function GameBoyView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const song = useStore((s) => s.song);
  const project = useStore((s) => s.project);
  const script = useStore((s) => s.script);
  const frame = useStore((s) => s.frame);
  const playing = useStore((s) => s.playing);

  const lanes = useMemo(() => {
    if (!project) return [];
    return lanesFor(project, PROFILES[project.chip === "gb" ? "gb" : "nes"]);
  }, [project]);

  const clock = useRef({ frame: 0, at: 0 });
  useEffect(() => {
    clock.current = { frame, at: performance.now() };
  }, [frame]);

  useEffect(() => {
    if (!script || !song) return;
    let raf = 0;
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;

    const tick = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
      const est = playing
        ? clock.current.frame + ((performance.now() - clock.current.at) / 1000) * 60
        : clock.current.frame;
      drawGbFrame(
        g,
        script,
        lanes,
        Math.min(est, script.frameCount - 1),
        canvas.width,
        canvas.height,
        song.name,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [script, song, lanes, playing]);

  if (!script) return null;
  return (
    <div className="relative min-h-0 flex-1 bg-[#0f380f] p-3">
      <div className="h-full w-full overflow-hidden rounded-lg border-4 border-[#306230]">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </div>
  );
}
