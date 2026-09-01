import { useRef } from "react";
import { useStore } from "../store";

export default function EmptyState() {
  const loadMidi = useStore((s) => s.loadMidi);
  const loadDemo = useStore((s) => s.loadDemo);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    loadMidi(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Chiptune Composer</h1>
      <p className="text-zinc-400">Turn any MIDI file into NES music.</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border-2 border-dashed border-zinc-700 px-16 py-10 text-zinc-400 hover:border-emerald-600 hover:text-zinc-200"
      >
        Drop a .mid file anywhere
        <span className="mt-1 block text-xs text-zinc-600">or click to browse</span>
      </button>
      <button
        onClick={() => void loadDemo()}
        className="rounded bg-emerald-600 px-5 py-2 font-mono text-sm hover:bg-emerald-500"
      >
        Try a demo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        className="hidden"
        onChange={(e) => void onPick(e.target.files)}
      />
    </div>
  );
}
