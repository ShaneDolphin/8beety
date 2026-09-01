import { useRef, useState } from "react";
import { useStore } from "../store";

export default function BarRuler() {
  const script = useStore((s) => s.script);
  const frame = useStore((s) => s.frame);
  const loopBars = useStore((s) => s.loopBars);
  const setLoopBars = useStore((s) => s.setLoopBars);
  const seek = useStore((s) => s.seek);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  if (!script || script.barStarts.length === 0) return null;
  const { barStarts, frameCount } = script;

  const barAt = (clientX: number): number => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * frameCount;
    let bar = 0;
    for (let i = 0; i < barStarts.length; i++) if (barStarts[i] <= f) bar = i;
    return bar;
  };

  const barX = (bar: number): number =>
    ((bar < barStarts.length ? barStarts[bar] : frameCount) / frameCount) * 100;

  const shown = drag ? ([Math.min(drag.from, drag.to), Math.max(drag.from, drag.to) + 1] as const) : loopBars;

  return (
    <div
      ref={rulerRef}
      className="relative h-6 cursor-col-resize select-none border-b border-zinc-800 bg-zinc-900"
      title="Click to seek to a bar; drag to set a loop range"
      onMouseDown={(e) => {
        const bar = barAt(e.clientX);
        setDrag({ from: bar, to: bar });
      }}
      onMouseMove={(e) => {
        if (drag) setDrag({ ...drag, to: barAt(e.clientX) });
      }}
      onMouseUp={(e) => {
        if (!drag) return;
        const to = barAt(e.clientX);
        if (to === drag.from) {
          seek(barStarts[drag.from]);
          setLoopBars(null);
        } else {
          setLoopBars([Math.min(drag.from, to), Math.max(drag.from, to) + 1]);
        }
        setDrag(null);
      }}
      onMouseLeave={() => setDrag(null)}
    >
      {shown && (
        <div
          className="absolute inset-y-0 bg-emerald-500/25"
          style={{ left: `${barX(shown[0])}%`, width: `${barX(shown[1]) - barX(shown[0])}%` }}
        />
      )}
      {barStarts.map((f, i) => (
        <span
          key={i}
          className="absolute top-0 h-full border-l border-zinc-700 pl-1 font-mono text-[9px] leading-6 text-zinc-500"
          style={{ left: `${(f / frameCount) * 100}%` }}
        >
          {i + 1}
        </span>
      ))}
      <div
        className="absolute top-0 h-full w-px bg-red-400"
        style={{ left: `${(frame / frameCount) * 100}%` }}
      />
    </div>
  );
}
