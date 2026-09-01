import { useState } from "react";
import { COFFEE_URL } from "../config";
import { renderScript } from "../audio/render";
import { encodeWav } from "../audio/wav";
import { exportArrangedMidi } from "../engine/midi-export";
import { encodeShare } from "../engine/share";
import { useStore } from "../store";

const SHARE_MIDI_LIMIT = 100 * 1024; // §10.2: embed MIDI in links only under 100 KB

function download(data: ArrayBuffer | Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loopFade, setLoopFade] = useState(false);
  const script = useStore((s) => s.script);
  const project = useStore((s) => s.project);
  const song = useStore((s) => s.song);
  const buildProjectFile = useStore((s) => s.buildProjectFile);
  const showToast = useStore((s) => s.showToast);

  if (!script || !project || !song) return null;
  const base = song.name.replace(/\.midi?$/i, "") || "chiptune";

  async function exportWav(sampleRate: 44100 | 48000) {
    if (!script) return;
    setBusy(true);
    try {
      const channels = await renderScript(script, sampleRate, { loopTwiceFade: loopFade });
      download(encodeWav(channels, sampleRate), `${base}.wav`, "audio/wav");
      showToast(COFFEE_URL !== "" ? "WAV exported. Enjoying this? Buy me a coffee ☕" : "WAV exported.");
    } catch (err) {
      showToast(`WAV export failed: ${String(err)}`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  function exportJson() {
    const built = buildProjectFile();
    if (!built) return;
    download(JSON.stringify(built.file, null, 2), `${base}.chiptune.json`, "application/json");
    showToast("Project saved.");
    setOpen(false);
  }

  function exportMidi() {
    if (!script || !project) return;
    download(
      exportArrangedMidi(script, project.bpm),
      `${base}-arranged.mid`,
      "audio/midi",
    );
    showToast("Arranged MIDI exported.");
    setOpen(false);
  }

  async function copyShareLink() {
    const built = buildProjectFile(SHARE_MIDI_LIMIT);
    if (!built) return;
    const url = `${location.origin}${location.pathname}#${encodeShare(built.file)}`;
    await navigator.clipboard.writeText(url);
    showToast(
      built.midiOmitted
        ? "Link copied — MIDI is over 100 KB, so the recipient must load the .mid themselves."
        : "Share link copied.",
    );
    setOpen(false);
  }

  const item =
    "block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-800 disabled:opacity-40";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
      >
        {busy ? "Rendering…" : "Export ▾"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          <button className={item} disabled={busy} onClick={() => void exportWav(44100)}>
            Download WAV · 44.1 kHz
          </button>
          <button className={item} disabled={busy} onClick={() => void exportWav(48000)}>
            Download WAV · 48 kHz
          </button>
          <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={loopFade}
              onChange={(e) => setLoopFade(e.target.checked)}
            />
            Loop 2× + fade out
          </label>
          <div className="my-1 border-t border-zinc-800" />
          <button className={item} onClick={exportJson}>
            Download project JSON
          </button>
          <button className={item} onClick={exportMidi}>
            Download arranged MIDI
          </button>
          <button className={item} onClick={() => void copyShareLink()}>
            Copy share link
          </button>
        </div>
      )}
    </div>
  );
}
