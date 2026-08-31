import { useRef, useState } from "react";
import testToneUrl from "./audio/test-tone-worklet.ts?worker&url";

export default function App() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const [playing, setPlaying] = useState(false);

  async function toggle() {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(testToneUrl);
      ctxRef.current = ctx;
    }
    const ctx = ctxRef.current;
    if (playing) {
      nodeRef.current?.disconnect();
      nodeRef.current = null;
      setPlaying(false);
    } else {
      await ctx.resume(); // required inside the user gesture (iOS Safari)
      const node = new AudioWorkletNode(ctx, "test-tone");
      node.connect(ctx.destination);
      nodeRef.current = node;
      setPlaying(true);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Chiptune Composer</h1>
      <button
        onClick={() => void toggle()}
        className="rounded bg-emerald-600 px-6 py-2 font-mono hover:bg-emerald-500"
      >
        {playing ? "■ Stop" : "▶ Play 440 Hz"}
      </button>
    </div>
  );
}
