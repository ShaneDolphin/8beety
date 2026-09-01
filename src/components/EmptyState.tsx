import { useRef } from "react";
import { decodeProjectFile } from "../engine/project-io";
import { useStore } from "../store";
import PixelLogo from "./PixelLogo";

export default function EmptyState() {
  const loadMidi = useStore((s) => s.loadMidi);
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
        else showToast("Not a valid 8BEETY project file.");
      } catch {
        showToast("Not a valid 8BEETY project file.");
      }
      return;
    }
    loadMidi(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1>
        <PixelLogo className="h-16 w-auto" />
      </h1>
      <p className="text-zinc-400">Turn any MIDI file into NES or Game Boy music.</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border-2 border-dashed border-zinc-700 px-16 py-10 text-zinc-300 hover:border-emerald-600 hover:text-zinc-100"
      >
        <span className="text-lg font-bold">Upload a MIDI file to get started</span>
        <span className="mt-1 block text-xs text-zinc-500">
          drop a .mid anywhere on this page, or click to browse
        </span>
      </button>
      <p className="max-w-md text-center text-xs text-zinc-600">
        Your file never leaves the browser — it's parsed, arranged, and played locally. You can
        also load a saved 8BEETY project (.json).
      </p>
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
