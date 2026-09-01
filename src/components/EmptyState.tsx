import { useRef } from "react";
import { decodeProjectFile } from "../engine/project-io";
import { useStore } from "../store";

export default function EmptyState() {
  const loadMidi = useStore((s) => s.loadMidi);
  const loadDemo = useStore((s) => s.loadDemo);
  const loadProjectFile = useStore((s) => s.loadProjectFile);
  const showToast = useStore((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (/\.json$/i.test(file.name)) {
      try {
        const decoded = decodeProjectFile(JSON.parse(await file.text()));
        if (decoded) loadProjectFile(decoded);
        else showToast("Not a valid Chiptune Composer project file.");
      } catch {
        showToast("Not a valid Chiptune Composer project file.");
      }
      return;
    }
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
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-600">Try a demo</span>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { name: "adventure", label: "🗺 Adventure" },
            { name: "dungeon", label: "🕯 Dungeon" },
            { name: "boss", label: "⚔ Boss Fight" },
          ].map((d) => (
            <button
              key={d.name}
              onClick={() => void loadDemo(d.name)}
              className="rounded bg-emerald-600 px-4 py-2 font-mono text-sm hover:bg-emerald-500"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,.json,audio/midi,application/json"
        className="hidden"
        onChange={(e) => void onPick(e.target.files)}
      />
    </div>
  );
}
